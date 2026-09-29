import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  PHOTOS: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/", (c) => {
  return c.json({
    name: "Tatralandia údržba API",
  });
});

/* =========================================================
   POMOCNÁ FUNKCIA - ULOŽENIE FOTOGRAFIE
   ========================================================= */

async function savePhoto(
  bucket: R2Bucket,
  photo: File,
  folder: string
): Promise<string> {
  if (!photo.type.startsWith("image/")) {
    throw new Error("Priložený súbor nie je fotografia.");
  }

  if (photo.size > 10 * 1024 * 1024) {
    throw new Error(
      "Fotografia je príliš veľká. Maximum je 10 MB."
    );
  }

  let extension =
    photo.name.split(".").pop()?.toLowerCase() || "jpg";

  extension = extension.replace(/[^a-z0-9]/g, "");

  if (!extension) {
    extension = "jpg";
  }

  const key =
    `${folder}/` +
    `${Date.now()}-` +
    `${crypto.randomUUID()}.` +
    extension;

  await bucket.put(key, photo.stream(), {
    httpMetadata: {
      contentType: photo.type || "image/jpeg",
    },
  });

  return key;
}

/* =========================================================
   NAČÍTANIE FOTOGRAFIE
   ========================================================= */

app.get("/api/photo", async (c) => {
  try {
    const key = c.req.query("key");

    if (!key) {
      return c.text("Chýba kľúč fotografie.", 400);
    }

    const object = await c.env.PHOTOS.get(key);

    if (!object) {
      return c.text("Fotografia nebola nájdená.", 404);
    }

    const headers = new Headers();

    object.writeHttpMetadata(headers);

    headers.set(
      "Cache-Control",
      "private, max-age=3600"
    );

    return new Response(object.body, {
      headers,
    });
  } catch (error) {
    console.error(error);

    return c.text(
      "Fotografiu sa nepodarilo načítať.",
      500
    );
  }
});

/* =========================================================
   NOVÁ ZÁVADA
   ========================================================= */

app.post("/api/issues", async (c) => {
  try {
    const formData = await c.req.formData();

    const reporterName = String(
      formData.get("reporter_name") || ""
    ).trim();

    const location = String(
      formData.get("location") || ""
    ).trim();

    const description = String(
      formData.get("description") || ""
    ).trim();

    if (!reporterName || !location || !description) {
      return c.json(
        {
          success: false,
          error:
            "Chýba meno, miesto alebo popis závady.",
        },
        400
      );
    }

    let photoKey: string | null = null;

    const photo = formData.get("photo");

    if (photo instanceof File && photo.size > 0) {
      try {
        photoKey = await savePhoto(
          c.env.PHOTOS,
          photo,
          "issues/original"
        );
      } catch (error) {
        return c.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Fotografiu sa nepodarilo uložiť.",
          },
          400
        );
      }
    }

    const result = await c.env.DB.prepare(
      `
      INSERT INTO issues (
        reporter_name,
        location,
        description,
        photo_key,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `
    )
      .bind(
        reporterName,
        location,
        description,
        photoKey
      )
      .run();

    const issueId = result.meta.last_row_id;

    await c.env.DB.prepare(
      `
      INSERT INTO issue_events (
        issue_id,
        event_type,
        actor_role,
        actor_name,
        message,
        photo_key,
        created_at
      )
      VALUES (?, 'created', 'reporter', ?, ?, ?, CURRENT_TIMESTAMP)
      `
    )
      .bind(
        issueId,
        reporterName,
        "Závada bola nahlásená.",
        photoKey
      )
      .run();

    return c.json({
      success: true,
      issue_id: issueId,
      photo_key: photoKey,
    });
  } catch (error) {
    console.error(error);

    return c.json(
      {
        success: false,
        error: "Nepodarilo sa uložiť závadu.",
      },
      500
    );
  }
});

/* =========================================================
   ZOZNAM ZÁVAD
   ========================================================= */

app.get("/api/issues", async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `
      SELECT
        id,
        reporter_name,
        location,
        description,
        photo_key,
        status,
        current_worker_name,
        last_actor_name,
        created_at,
        updated_at,
        closed_at
      FROM issues
      ORDER BY id DESC
      `
    ).all();

    return c.json({
      success: true,
      issues: result.results,
    });
  } catch (error) {
    console.error(error);

    return c.json(
      {
        success: false,
        error:
          "Nepodarilo sa načítať závady.",
      },
      500
    );
  }
});

/* =========================================================
   PREVZATIE ZÁVADY ÚDRŽBÁROM
   ========================================================= */

app.post("/api/issues/:id/take", async (c) => {
  try {
    const id = Number(c.req.param("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return c.json(
        {
          success: false,
          error: "Neplatné číslo závady.",
        },
        400
      );
    }

    const body = await c.req.json();

    const workerName = String(
      body.worker_name || ""
    ).trim();

    if (!workerName) {
      return c.json(
        {
          success: false,
          error: "Chýba meno údržbára.",
        },
        400
      );
    }

    const updateResult = await c.env.DB.prepare(
      `
      UPDATE issues
      SET
        status = 'progress',
        current_worker_name = ?,
        last_actor_name = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'new'
      `
    )
      .bind(workerName, workerName, id)
      .run();

    if (!updateResult.meta.changes) {
      return c.json(
        {
          success: false,
          error:
            "Závadu už pravdepodobne prevzal iný pracovník.",
        },
        409
      );
    }

    await c.env.DB.prepare(
      `
      INSERT INTO issue_events (
        issue_id,
        event_type,
        actor_role,
        actor_name,
        message,
        created_at
      )
      VALUES (?, 'taken', 'maintenance', ?, ?, CURRENT_TIMESTAMP)
      `
    )
      .bind(
        id,
        workerName,
        "Údržbár prevzal závadu."
      )
      .run();

    const updatedIssue = await c.env.DB.prepare(
      `
      SELECT *
      FROM issues
      WHERE id = ?
      `
    )
      .bind(id)
      .first();

    return c.json({
      success: true,
      issue: updatedIssue,
    });
  } catch (error) {
    console.error(error);

    return c.json(
      {
        success: false,
        error:
          "Nepodarilo sa prevziať závadu.",
      },
      500
    );
  }
});

/* =========================================================
   AKCIA ÚDRŽBÁRA
   closed / material / manager
   ========================================================= */

app.post("/api/issues/:id/status", async (c) => {
  try {
    const id = Number(c.req.param("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return c.json(
        {
          success: false,
          error: "Neplatné číslo závady.",
        },
        400
      );
    }

    const formData = await c.req.formData();

    const workerName = String(
      formData.get("worker_name") || ""
    ).trim();

    const newStatus = String(
      formData.get("status") || ""
    ).trim();

    const message = String(
      formData.get("message") || ""
    ).trim();

    if (!workerName) {
      return c.json(
        {
          success: false,
          error: "Chýba meno údržbára.",
        },
        400
      );
    }

    if (
      !["closed", "material", "manager"].includes(
        newStatus
      )
    ) {
      return c.json(
        {
          success: false,
          error: "Neplatný stav závady.",
        },
        400
      );
    }

    if (!message) {
      return c.json(
        {
          success: false,
          error:
            "Napíšte krátky komentár k vykonanej akcii.",
        },
        400
      );
    }

    let actionPhotoKey: string | null = null;

    const actionPhoto = formData.get("photo");

    if (
      actionPhoto instanceof File &&
      actionPhoto.size > 0
    ) {
      let folder = "issues/actions";

      if (newStatus === "closed") {
        folder = "issues/resolved";
      }

      if (newStatus === "material") {
        folder = "issues/material";
      }

      if (newStatus === "manager") {
        folder = "issues/manager";
      }

      try {
        actionPhotoKey = await savePhoto(
          c.env.PHOTOS,
          actionPhoto,
          folder
        );
      } catch (error) {
        return c.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Fotografiu sa nepodarilo uložiť.",
          },
          400
        );
      }
    }

    const closedSql =
      newStatus === "closed"
        ? "CURRENT_TIMESTAMP"
        : "NULL";

    const updateResult = await c.env.DB.prepare(
      `
      UPDATE issues
      SET
        status = ?,
        last_actor_name = ?,
        updated_at = CURRENT_TIMESTAMP,
        closed_at = ${closedSql}
      WHERE id = ?
        AND status = 'progress'
      `
    )
      .bind(
        newStatus,
        workerName,
        id
      )
      .run();

    if (!updateResult.meta.changes) {
      return c.json(
        {
          success: false,
          error:
            "Stav závady sa medzitým zmenil. Obnovte zoznam.",
        },
        409
      );
    }

    let eventType = "updated";

    if (newStatus === "closed") {
      eventType = "resolved";
    }

    if (newStatus === "material") {
      eventType =
        "material_requested";
    }

    if (newStatus === "manager") {
      eventType =
        "escalated_to_manager";
    }

    await c.env.DB.prepare(
      `
      INSERT INTO issue_events (
        issue_id,
        event_type,
        actor_role,
        actor_name,
        message,
        photo_key,
        created_at
      )
      VALUES (?, ?, 'maintenance', ?, ?, ?, CURRENT_TIMESTAMP)
      `
    )
      .bind(
        id,
        eventType,
        workerName,
        message,
        actionPhotoKey
      )
      .run();

    const updatedIssue =
      await c.env.DB.prepare(
        `
        SELECT *
        FROM issues
        WHERE id = ?
        `
      )
        .bind(id)
        .first();

    return c.json({
      success: true,
      issue: updatedIssue,
      action_photo_key:
        actionPhotoKey,
    });
  } catch (error) {
    console.error(error);

    return c.json(
      {
        success: false,
        error:
          "Akciu sa nepodarilo uložiť.",
      },
      500
    );
  }
});

/* =========================================================
   AKCIA VEDÚCEHO ÚDRŽBY
   return / close / operations
   ========================================================= */

app.post(
  "/api/issues/:id/manager-action",
  async (c) => {
    try {
      const id = Number(
        c.req.param("id")
      );

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        return c.json(
          {
            success: false,
            error:
              "Neplatné číslo závady.",
          },
          400
        );
      }

      const formData =
        await c.req.formData();

      const managerName = String(
        formData.get("manager_name") || ""
      ).trim();

      const action = String(
        formData.get("action") || ""
      ).trim();

      const message = String(
        formData.get("message") || ""
      ).trim();

      if (!managerName) {
        return c.json(
          {
            success: false,
            error:
              "Chýba meno vedúceho údržby.",
          },
          400
        );
      }

      if (
        ![
          "return",
          "close",
          "operations",
        ].includes(action)
      ) {
        return c.json(
          {
            success: false,
            error:
              "Neplatná akcia vedúceho.",
          },
          400
        );
      }

      if (!message) {
        return c.json(
          {
            success: false,
            error:
              "Napíšte krátky komentár k akcii.",
          },
          400
        );
      }

      const currentIssue =
        await c.env.DB.prepare(
          `
          SELECT *
          FROM issues
          WHERE id = ?
          `
        )
          .bind(id)
          .first<any>();

      if (!currentIssue) {
        return c.json(
          {
            success: false,
            error:
              "Závada nebola nájdená.",
          },
          404
        );
      }

      if (
        !["manager", "material"].includes(
          String(
            currentIssue.status
          )
        )
      ) {
        return c.json(
          {
            success: false,
            error:
              "Táto závada už nie je u vedúceho údržby.",
          },
          409
        );
      }

      let photoKey: string | null =
        null;

      const photo =
        formData.get("photo");

      if (
        photo instanceof File &&
        photo.size > 0
      ) {
        let folder =
          "issues/manager-actions";

        if (action === "close") {
          folder =
            "issues/manager-resolved";
        }

        if (
          action === "operations"
        ) {
          folder =
            "issues/operations";
        }

        try {
          photoKey =
            await savePhoto(
              c.env.PHOTOS,
              photo,
              folder
            );
        } catch (error) {
          return c.json(
            {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Fotografiu sa nepodarilo uložiť.",
            },
            400
          );
        }
      }

      let newStatus = "";
      let eventType = "";
      let eventMessage = message;

      if (action === "return") {
        newStatus = "new";
        eventType =
          "returned_to_maintenance";
      }

      if (action === "close") {
        newStatus = "closed";
        eventType =
          "manager_resolved";
      }

      if (
        action === "operations"
      ) {
        newStatus =
          "operations";

        eventType =
          "escalated_to_operations";
      }

      if (action === "return") {
        await c.env.DB.prepare(
          `
          UPDATE issues
          SET
            status = 'new',
            current_worker_name = NULL,
            last_actor_name = ?,
            updated_at = CURRENT_TIMESTAMP,
            closed_at = NULL
          WHERE id = ?
          `
        )
          .bind(
            managerName,
            id
          )
          .run();
      }

      if (action === "close") {
        await c.env.DB.prepare(
          `
          UPDATE issues
          SET
            status = 'closed',
            last_actor_name = ?,
            updated_at = CURRENT_TIMESTAMP,
            closed_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `
        )
          .bind(
            managerName,
            id
          )
          .run();
      }

      if (
        action === "operations"
      ) {
        await c.env.DB.prepare(
          `
          UPDATE issues
          SET
            status = 'operations',
            last_actor_name = ?,
            updated_at = CURRENT_TIMESTAMP,
            closed_at = NULL
          WHERE id = ?
          `
        )
          .bind(
            managerName,
            id
          )
          .run();
      }

      await c.env.DB.prepare(
        `
        INSERT INTO issue_events (
          issue_id,
          event_type,
          actor_role,
          actor_name,
          message,
          photo_key,
          created_at
        )
        VALUES (?, ?, 'maintenance_manager', ?, ?, ?, CURRENT_TIMESTAMP)
        `
      )
        .bind(
          id,
          eventType,
          managerName,
          eventMessage,
          photoKey
        )
        .run();

      const updatedIssue =
        await c.env.DB.prepare(
          `
          SELECT *
          FROM issues
          WHERE id = ?
          `
        )
          .bind(id)
          .first();

      return c.json({
        success: true,
        issue: updatedIssue,
        photo_key: photoKey,
      });
    } catch (error) {
      console.error(error);

      return c.json(
        {
          success: false,
          error:
            "Akciu vedúceho sa nepodarilo uložiť.",
        },
        500
      );
    }
  }
);

/* =========================================================
   HISTÓRIA ZÁVADY
   ========================================================= */

app.get(
  "/api/issues/:id/events",
  async (c) => {
    try {
      const id = Number(
        c.req.param("id")
      );

      const result =
        await c.env.DB.prepare(
          `
          SELECT
            id,
            issue_id,
            event_type,
            actor_role,
            actor_name,
            message,
            photo_key,
            created_at
          FROM issue_events
          WHERE issue_id = ?
          ORDER BY id DESC
          `
        )
          .bind(id)
          .all();

      return c.json({
        success: true,
        events: result.results,
      });
    } catch (error) {
      console.error(error);

      return c.json(
        {
          success: false,
          error:
            "Nepodarilo sa načítať históriu.",
        },
        500
      );
    }
  }
);

export default app;
