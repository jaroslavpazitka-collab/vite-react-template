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
   FOTOGRAFIA Z R2
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
   NOVÁ ZÁVADA + VOLITEĽNÁ FOTOGRAFIA
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

    if (
      !reporterName ||
      !location ||
      !description
    ) {
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

    if (
      photo &&
      photo instanceof File &&
      photo.size > 0
    ) {
      if (!photo.type.startsWith("image/")) {
        return c.json(
          {
            success: false,
            error:
              "Priložený súbor nie je fotografia.",
          },
          400
        );
      }

      // Max 10 MB na jednu fotografiu.
      if (photo.size > 10 * 1024 * 1024) {
        return c.json(
          {
            success: false,
            error:
              "Fotografia je príliš veľká. Maximum je 10 MB.",
          },
          400
        );
      }

      const extension =
        photo.name.split(".").pop()?.toLowerCase() ||
        "jpg";

      photoKey =
        `issues/original/` +
        `${Date.now()}-` +
        `${crypto.randomUUID()}.${extension}`;

      await c.env.PHOTOS.put(
        photoKey,
        photo.stream(),
        {
          httpMetadata: {
            contentType:
              photo.type || "image/jpeg",
          },
        }
      );
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

    const issueId =
      result.meta.last_row_id;

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
        error:
          "Nepodarilo sa uložiť závadu.",
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
   PREVZATIE ZÁVADY
   ========================================================= */

app.post(
  "/api/issues/:id/take",
  async (c) => {
    try {
      const id = Number(
        c.req.param("id")
      );

      const body =
        await c.req.json();

      const workerName = String(
        body.worker_name || ""
      ).trim();

      if (!workerName) {
        return c.json(
          {
            success: false,
            error:
              "Chýba meno údržbára.",
          },
          400
        );
      }

      const updateResult =
        await c.env.DB.prepare(
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
          .bind(
            workerName,
            workerName,
            id
          )
          .run();

      if (
        !updateResult.meta.changes
      ) {
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
  }
);

/* =========================================================
   HISTÓRIA JEDNEJ ZÁVADY
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
