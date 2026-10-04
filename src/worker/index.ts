import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  PHOTOS: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/", (c) => {
  return c.json({ name: "Tatralandia údržba API" });
});

async function savePhoto(
  bucket: R2Bucket,
  photo: File,
  folder: string
): Promise<string> {
  if (!photo.type.startsWith("image/")) {
    throw new Error("Priložený súbor nie je fotografia.");
  }
  if (photo.size > 10 * 1024 * 1024) {
    throw new Error("Fotografia je príliš veľká. Maximum je 10 MB.");
  }
  let extension = photo.name.split(".").pop()?.toLowerCase() || "jpg";
  extension = extension.replace(/[^a-z0-9]/g, "");
  if (!extension) extension = "jpg";
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await bucket.put(key, photo.stream(), {
    httpMetadata: { contentType: photo.type || "image/jpeg" },
  });
  return key;
}


let featureTablesReady = false;

async function ensureFeatureTables(db: D1Database) {
  if (featureTablesReady) return;

  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS maintenance_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_name TEXT NOT NULL,
        category TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        photo_key TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at TEXT
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS maintenance_message_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        actor_role TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        message TEXT NOT NULL,
        photo_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES maintenance_messages(id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_type TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        audiences TEXT NOT NULL DEFAULT 'public,maintenance,management',
        photo_key TEXT,
        created_by_role TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        archived_at TEXT
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_maintenance_messages_status ON maintenance_messages(status)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_maintenance_message_replies_message_id ON maintenance_message_replies(message_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_alerts_dates ON alerts(start_date, end_date)`),
  ]);

  featureTablesReady = true;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywords(value: string) {
  const stop = new Set([
    "a", "aj", "ale", "ako", "alebo", "bez", "by", "do", "je", "na", "nie",
    "od", "po", "pre", "pri", "sa", "si", "sme", "som", "su", "to", "tu", "v",
    "vo", "z", "za", "ze", "ked", "ktory", "ktora", "ktore", "toto", "tento",
  ]);

  return new Set(
    normalizeSearchText(value)
      .split(" ")
      .filter((word) => word.length >= 3 && !stop.has(word))
  );
}

function overlapScore(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

app.get("/api/photo", async (c) => {
  try {
    const key = c.req.query("key");
    if (!key) return c.text("Chýba kľúč fotografie.", 400);
    const object = await c.env.PHOTOS.get(key);
    if (!object) return c.text("Fotografia nebola nájdená.", 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, max-age=3600");
    return new Response(object.body, { headers });
  } catch (error) {
    console.error(error);
    return c.text("Fotografiu sa nepodarilo načítať.", 500);
  }
});

app.post("/api/issues", async (c) => {
  try {
    const formData = await c.req.formData();
    const reporterName = String(formData.get("reporter_name") || "").trim();
    const location = String(formData.get("location") || "").trim();
    const description = String(formData.get("description") || "").trim();
    if (!reporterName || !location || !description) {
      return c.json({ success: false, error: "Chýba meno, miesto alebo popis závady." }, 400);
    }
    let photoKey: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      try {
        photoKey = await savePhoto(c.env.PHOTOS, photo, "issues/original");
      } catch (error) {
        return c.json({ success: false, error: error instanceof Error ? error.message : "Fotografiu sa nepodarilo uložiť." }, 400);
      }
    }
    const result = await c.env.DB.prepare(`
      INSERT INTO issues (reporter_name,location,description,photo_key,status,created_at,updated_at)
      VALUES (?, ?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(reporterName, location, description, photoKey).run();
    const issueId = result.meta.last_row_id;
    await c.env.DB.prepare(`
      INSERT INTO issue_events (issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, 'created', 'reporter', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(issueId, reporterName, "Závada bola nahlásená.", photoKey).run();
    return c.json({ success: true, issue_id: issueId, photo_key: photoKey });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Nepodarilo sa uložiť závadu." }, 500);
  }
});

app.get("/api/issues", async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT
        i.id,
        i.reporter_name,
        i.location,
        i.description,
        i.photo_key,
        i.status,
        i.current_worker_name,
        i.last_actor_name,
        i.created_at,
        i.updated_at,
        i.closed_at,
        COALESCE((
          SELECT GROUP_CONCAT(COALESCE(e.message,'') || ' ' || COALESCE(e.actor_name,''), ' ')
          FROM issue_events e
          WHERE e.issue_id = i.id
        ), '') AS event_text,
        COALESCE((
          SELECT COUNT(*) FROM issue_events e
          WHERE e.issue_id = i.id AND e.event_type = 'rating_up'
        ), 0) AS rating_up_count,
        COALESCE((
          SELECT COUNT(*) FROM issue_events e
          WHERE e.issue_id = i.id AND e.event_type = 'rating_down'
        ), 0) AS rating_down_count
      FROM issues i
      ORDER BY i.id DESC
    `).all();
    return c.json({ success: true, issues: result.results });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Nepodarilo sa načítať závady." }, 500);
  }
});

app.post("/api/issues/:id/take", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, error: "Neplatné číslo závady." }, 400);
    const body = await c.req.json();
    const workerName = String(body.worker_name || "").trim();
    if (!workerName) return c.json({ success: false, error: "Chýba meno údržbára." }, 400);
    const updateResult = await c.env.DB.prepare(`
      UPDATE issues SET status='progress',current_worker_name=?,last_actor_name=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='new'
    `).bind(workerName, workerName, id).run();
    if (!updateResult.meta.changes) return c.json({ success: false, error: "Závadu už pravdepodobne prevzal iný pracovník." }, 409);
    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,created_at)
      VALUES (?, 'taken', 'maintenance', ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, workerName, "Údržbár prevzal závadu.").run();
    const updatedIssue = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
    return c.json({ success: true, issue: updatedIssue });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Nepodarilo sa prevziať závadu." }, 500);
  }
});

app.post("/api/issues/:id/status", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, error: "Neplatné číslo závady." }, 400);
    const formData = await c.req.formData();
    const workerName = String(formData.get("worker_name") || "").trim();
    const status = String(formData.get("status") || "").trim();
    const message = String(formData.get("message") || "").trim();
    if (!workerName) return c.json({ success: false, error: "Chýba meno údržbára." }, 400);
    if (!["closed", "material", "manager"].includes(status)) return c.json({ success: false, error: "Neplatný stav závady." }, 400);
    if (!message) return c.json({ success: false, error: "Napíšte krátky komentár k vykonanej akcii." }, 400);
    let actionPhotoKey: string | null = null;
    const actionPhoto = formData.get("photo");
    if (actionPhoto instanceof File && actionPhoto.size > 0) {
      let folder = "issues/actions";
      if (status === "closed") folder = "issues/resolved";
      if (status === "material") folder = "issues/material";
      if (status === "manager") folder = "issues/manager";
      try {
        actionPhotoKey = await savePhoto(c.env.PHOTOS, actionPhoto, folder);
      } catch (error) {
        return c.json({ success: false, error: error instanceof Error ? error.message : "Fotografiu sa nepodarilo uložiť." }, 400);
      }
    }
    const closedSql = status === "closed" ? "CURRENT_TIMESTAMP" : "NULL";
    const updateResult = await c.env.DB.prepare(`
      UPDATE issues SET status=?,last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=${closedSql}
      WHERE id=? AND status='progress'
    `).bind(status, workerName, id).run();
    if (!updateResult.meta.changes) return c.json({ success: false, error: "Stav závady sa medzitým zmenil. Obnovte zoznam." }, 409);
    let eventType = "updated";
    if (status === "closed") eventType = "resolved";
    if (status === "material") eventType = "material_requested";
    if (status === "manager") eventType = "escalated_to_manager";
    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, ?, 'maintenance', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, eventType, workerName, message, actionPhotoKey).run();
    const updatedIssue = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
    return c.json({ success: true, issue: updatedIssue, action_photo_key: actionPhotoKey });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Akciu sa nepodarilo uložiť." }, 500);
  }
});

app.post("/api/issues/:id/manager-action", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, error: "Neplatné číslo závady." }, 400);
    const formData = await c.req.formData();
    const managerName = String(formData.get("manager_name") || "").trim();
    const action = String(formData.get("action") || "").trim();
    const message = String(formData.get("message") || "").trim();
    if (!managerName) return c.json({ success: false, error: "Chýba meno vedúceho údržby." }, 400);
    if (!["return", "close", "operations"].includes(action)) return c.json({ success: false, error: "Neplatná akcia vedúceho." }, 400);
    if (!message) return c.json({ success: false, error: "Napíšte krátky komentár k akcii." }, 400);
    const currentIssue = await c.env.DB.prepare(`SELECT status FROM issues WHERE id=?`).bind(id).first<{ status: string }>();
    if (!currentIssue) return c.json({ success: false, error: "Závada nebola nájdená." }, 404);
    if (!["manager", "material"].includes(currentIssue.status)) return c.json({ success: false, error: "Táto závada už nie je u vedúceho údržby." }, 409);
    let photoKey: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      let folder = "issues/manager-actions";
      if (action === "close") folder = "issues/manager-resolved";
      if (action === "operations") folder = "issues/operations";
      try {
        photoKey = await savePhoto(c.env.PHOTOS, photo, folder);
      } catch (error) {
        return c.json({ success: false, error: error instanceof Error ? error.message : "Fotografiu sa nepodarilo uložiť." }, 400);
      }
    }
    let eventType = "";
    if (action === "return") {
      await c.env.DB.prepare(`
        UPDATE issues SET status='new',current_worker_name=NULL,last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=? AND status IN ('manager','material')
      `).bind(managerName, id).run();
      eventType = "returned_to_maintenance";
    }
    if (action === "close") {
      await c.env.DB.prepare(`
        UPDATE issues SET status='closed',last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=CURRENT_TIMESTAMP
        WHERE id=? AND status IN ('manager','material')
      `).bind(managerName, id).run();
      eventType = "manager_resolved";
    }
    if (action === "operations") {
      await c.env.DB.prepare(`
        UPDATE issues SET status='operations',last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=? AND status IN ('manager','material')
      `).bind(managerName, id).run();
      eventType = "escalated_to_operations";
    }
    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, ?, 'maintenance_manager', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, eventType, managerName, message, photoKey).run();
    const updatedIssue = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
    return c.json({ success: true, issue: updatedIssue, photo_key: photoKey });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Akciu vedúceho sa nepodarilo uložiť." }, 500);
  }
});

app.post("/api/issues/:id/operations-action", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, error: "Neplatné číslo závady." }, 400);
    const formData = await c.req.formData();
    const operationsName = String(formData.get("operations_name") || "").trim();
    const action = String(formData.get("action") || "").trim();
    const message = String(formData.get("message") || "").trim();
    if (!operationsName) return c.json({ success: false, error: "Chýba meno prevádzkového manažéra." }, 400);
    if (!["return_manager", "close"].includes(action)) return c.json({ success: false, error: "Neplatná akcia prevádzkového manažéra." }, 400);
    if (!message) return c.json({ success: false, error: "Napíšte krátky komentár k rozhodnutiu." }, 400);
    const currentIssue = await c.env.DB.prepare(`SELECT status FROM issues WHERE id=?`).bind(id).first<{ status: string }>();
    if (!currentIssue) return c.json({ success: false, error: "Závada nebola nájdená." }, 404);
    if (currentIssue.status !== "operations") return c.json({ success: false, error: "Táto závada už nie je na rozhodnutí prevádzkového manažéra." }, 409);
    let photoKey: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      try {
        photoKey = await savePhoto(c.env.PHOTOS, photo, action === "close" ? "issues/operations-resolved" : "issues/operations-returned");
      } catch (error) {
        return c.json({ success: false, error: error instanceof Error ? error.message : "Fotografiu sa nepodarilo uložiť." }, 400);
      }
    }
    const eventType = action === "close" ? "operations_resolved" : "returned_to_manager";
    if (action === "close") {
      await c.env.DB.prepare(`
        UPDATE issues SET status='closed',last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=CURRENT_TIMESTAMP
        WHERE id=? AND status='operations'
      `).bind(operationsName, id).run();
    } else {
      await c.env.DB.prepare(`
        UPDATE issues SET status='manager',last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=? AND status='operations'
      `).bind(operationsName, id).run();
    }
    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, ?, 'operations_manager', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, eventType, operationsName, message, photoKey).run();
    const updatedIssue = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
    return c.json({ success: true, issue: updatedIssue, photo_key: photoKey });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Rozhodnutie sa nepodarilo uložiť." }, 500);
  }
});

app.post("/api/operations/tasks", async (c) => {
  try {
    const formData = await c.req.formData();
    const operationsName = String(formData.get("operations_name") || "").trim();
    const location = String(formData.get("location") || "").trim();
    const description = String(formData.get("description") || "").trim();
    if (!operationsName || !location || !description) {
      return c.json({ success: false, error: "Vyplňte meno, miesto a popis novej úlohy." }, 400);
    }
    let photoKey: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      try {
        photoKey = await savePhoto(c.env.PHOTOS, photo, "issues/operations-tasks");
      } catch (error) {
        return c.json({ success: false, error: error instanceof Error ? error.message : "Fotografiu sa nepodarilo uložiť." }, 400);
      }
    }
    const result = await c.env.DB.prepare(`
      INSERT INTO issues (reporter_name,location,description,photo_key,status,last_actor_name,created_at,updated_at)
      VALUES (?, ?, ?, ?, 'manager', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(operationsName, location, description, photoKey, operationsName).run();
    const issueId = result.meta.last_row_id;
    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, 'operations_task_created', 'operations_manager', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(issueId, operationsName, "Prevádzkový manažér vytvoril novú úlohu pre vedúceho údržby.", photoKey).run();
    return c.json({ success: true, issue_id: issueId });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Novú úlohu sa nepodarilo vytvoriť." }, 500);
  }
});

app.post("/api/issues/:id/rating", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, error: "Neplatné číslo závady." }, 400);
    const body = await c.req.json();
    const actorName = String(body.actor_name || "").trim();
    const actorRole = String(body.actor_role || "").trim();
    const rating = String(body.rating || "").trim();
    const message = String(body.message || "").trim();
    if (!actorName) return c.json({ success: false, error: "Chýba meno hodnotiteľa." }, 400);
    if (!["maintenance_manager", "operations_manager"].includes(actorRole)) return c.json({ success: false, error: "Táto rola nemôže hodnotiť opravu." }, 403);
    if (!["up", "down"].includes(rating)) return c.json({ success: false, error: "Neplatné hodnotenie." }, 400);
    const issue = await c.env.DB.prepare(`SELECT status,current_worker_name FROM issues WHERE id=?`).bind(id).first<{ status: string; current_worker_name: string | null }>();
    if (!issue) return c.json({ success: false, error: "Závada nebola nájdená." }, 404);
    if (issue.status !== "closed") return c.json({ success: false, error: "Hodnotiť je možné iba uzavretú opravu." }, 409);

    const maintenanceWorker = await c.env.DB.prepare(`
      SELECT actor_name
      FROM issue_events
      WHERE issue_id=?
        AND actor_role='maintenance'
        AND actor_name IS NOT NULL
        AND TRIM(actor_name) <> ''
      ORDER BY
        CASE
          WHEN event_type IN ('resolved','escalated_to_manager','material_requested') THEN 0
          WHEN event_type='taken' THEN 1
          ELSE 2
        END,
        id DESC
      LIMIT 1
    `).bind(id).first<{ actor_name: string | null }>();

    const ratedWorkerName =
      maintenanceWorker?.actor_name ||
      issue.current_worker_name;

    if (!ratedWorkerName) {
      return c.json({
        success: false,
        error: "Pri tejto závade sa nepodarilo určiť údržbára, ktorý ju riešil."
      }, 409);
    }

    const existing = await c.env.DB.prepare(`
      SELECT id FROM issue_events
      WHERE issue_id=? AND actor_role=? AND actor_name=? AND event_type IN ('rating_up','rating_down')
      ORDER BY id DESC LIMIT 1
    `).bind(id, actorRole, actorName).first<{ id: number }>();
    const eventType = rating === "up" ? "rating_up" : "rating_down";
    if (existing) {
      await c.env.DB.prepare(`
        UPDATE issue_events SET event_type=?,message=?,created_at=CURRENT_TIMESTAMP WHERE id=?
      `).bind(eventType, message || null, existing.id).run();
    } else {
      await c.env.DB.prepare(`
        INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(id, eventType, actorRole, actorName, message || null).run();
    }
    await c.env.DB.prepare(`UPDATE issues SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    return c.json({ success: true });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Hodnotenie sa nepodarilo uložiť." }, 500);
  }
});

app.get("/api/ratings", async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT
        r.id,
        r.issue_id,
        r.event_type,
        r.actor_role,
        r.actor_name,
        r.message,
        r.created_at,
        COALESCE(
          (
            SELECT e.actor_name
            FROM issue_events e
            WHERE e.issue_id = r.issue_id
              AND e.actor_role = 'maintenance'
              AND e.actor_name IS NOT NULL
              AND TRIM(e.actor_name) <> ''
            ORDER BY
              CASE
                WHEN e.event_type IN ('resolved','escalated_to_manager','material_requested') THEN 0
                WHEN e.event_type = 'taken' THEN 1
                ELSE 2
              END,
              e.id DESC
            LIMIT 1
          ),
          (
            SELECT i.current_worker_name
            FROM issues i
            WHERE i.id = r.issue_id
          )
        ) AS rated_worker_name
      FROM issue_events r
      WHERE r.event_type IN ('rating_up','rating_down')
      ORDER BY r.id DESC
    `).all();
    return c.json({ success: true, ratings: result.results });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Hodnotenia sa nepodarilo načítať." }, 500);
  }
});

app.get("/api/issues/:id/events", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, error: "Neplatné číslo závady." }, 400);
    const result = await c.env.DB.prepare(`
      SELECT id,issue_id,event_type,actor_role,actor_name,message,photo_key,created_at
      FROM issue_events WHERE issue_id=? ORDER BY id DESC
    `).bind(id).all();
    return c.json({ success: true, events: result.results });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Nepodarilo sa načítať históriu." }, 500);
  }
});


/* =========================================================
   DUPLICITY HLÁSENÍ
   ========================================================= */

app.post("/api/issues/duplicates", async (c) => {
  try {
    const body = await c.req.json();
    const location = String(body.location || "").trim();
    const description = String(body.description || "").trim();

    if (!location || !description) {
      return c.json({ success: true, candidates: [] });
    }

    const result = await c.env.DB.prepare(`
      SELECT id, location, description, photo_key, status, created_at, updated_at
      FROM issues
      WHERE status <> 'closed'
      ORDER BY id DESC
      LIMIT 120
    `).all<{
      id: number;
      location: string;
      description: string;
      photo_key: string | null;
      status: string;
      created_at: string;
      updated_at: string;
    }>();

    const newLocation = normalizeSearchText(location);
    const newLocationWords = keywords(location);
    const newDescription = normalizeSearchText(description);
    const newDescriptionWords = keywords(description);

    const candidates = (result.results || [])
      .map((issue) => {
        const issueLocation = normalizeSearchText(issue.location || "");
        const issueDescription = normalizeSearchText(issue.description || "");

        const locationExact =
          issueLocation === newLocation ||
          issueLocation.includes(newLocation) ||
          newLocation.includes(issueLocation);

        const locationSimilarity = locationExact
          ? 1
          : overlapScore(newLocationWords, keywords(issue.location || ""));

        const descriptionSimilarity = overlapScore(
          newDescriptionWords,
          keywords(issue.description || "")
        );

        const containsPhrase =
          newDescription.length >= 12 &&
          (issueDescription.includes(newDescription) ||
            newDescription.includes(issueDescription));

        const score = Math.min(
          1,
          locationSimilarity * 0.46 +
            descriptionSimilarity * 0.54 +
            (containsPhrase ? 0.18 : 0)
        );

        return { ...issue, score };
      })
      .filter((issue) => issue.score >= 0.34)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return c.json({ success: true, candidates });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Kontrola podobných závad zlyhala." }, 500);
  }
});

app.post("/api/issues/:id/duplicate-report", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ success: false, error: "Neplatné číslo závady." }, 400);
    }

    const issue = await c.env.DB.prepare(`
      SELECT id, status FROM issues WHERE id=?
    `).bind(id).first<{ id: number; status: string }>();

    if (!issue || issue.status === "closed") {
      return c.json({ success: false, error: "Táto závada už nie je otvorená." }, 409);
    }

    const formData = await c.req.formData();
    const reporterName = String(formData.get("reporter_name") || "").trim();
    const location = String(formData.get("location") || "").trim();
    const description = String(formData.get("description") || "").trim();

    if (!reporterName || !description) {
      return c.json({ success: false, error: "Chýba meno alebo popis hlásenia." }, 400);
    }

    let photoKey: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      photoKey = await savePhoto(c.env.PHOTOS, photo, "issues/duplicate-reports");
    }

    const message = [
      "Ďalšie hlásenie rovnakej závady.",
      location ? `Miesto: ${location}.` : "",
      `Popis: ${description}`,
    ].filter(Boolean).join(" ");

    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, 'duplicate_report', 'reporter', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, reporterName, message, photoKey).run();

    await c.env.DB.prepare(`
      UPDATE issues SET updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(id).run();

    return c.json({ success: true, issue_id: id });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Hlásenie sa nepodarilo pripojiť k existujúcej závade." }, 500);
  }
});

/* =========================================================
   SPRÁVY ÚDRŽBA -> VEDÚCI
   ========================================================= */

app.get("/api/messages", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const role = String(c.req.query("role") || "");
    const maintenanceName = String(c.req.query("maintenance_name") || "").trim();

    let result;
    if (role === "manager") {
      result = await c.env.DB.prepare(`
        SELECT m.*,
          (SELECT COUNT(*) FROM maintenance_message_replies r WHERE r.message_id=m.id) AS reply_count
        FROM maintenance_messages m
        ORDER BY CASE WHEN m.status='open' THEN 0 ELSE 1 END, m.updated_at DESC, m.id DESC
      `).all();
    } else {
      result = await c.env.DB.prepare(`
        SELECT m.*,
          (SELECT COUNT(*) FROM maintenance_message_replies r WHERE r.message_id=m.id) AS reply_count
        FROM maintenance_messages m
        WHERE LOWER(TRIM(m.sender_name)) = LOWER(TRIM(?))
        ORDER BY m.updated_at DESC, m.id DESC
      `).bind(maintenanceName).all();
    }

    return c.json({ success: true, messages: result.results });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Správy sa nepodarilo načítať." }, 500);
  }
});

app.post("/api/messages", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const formData = await c.req.formData();
    const senderName = String(formData.get("sender_name") || "").trim();
    const category = String(formData.get("category") || "ine").trim();
    const subject = String(formData.get("subject") || "").trim();
    const message = String(formData.get("message") || "").trim();

    if (!senderName || !subject || !message) {
      return c.json({ success: false, error: "Vyplňte predmet a text správy." }, 400);
    }

    let photoKey: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      photoKey = await savePhoto(c.env.PHOTOS, photo, "messages/original");
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO maintenance_messages(sender_name,category,subject,message,photo_key,status,created_at,updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(senderName, category, subject, message, photoKey).run();

    return c.json({ success: true, message_id: result.meta.last_row_id });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Správu sa nepodarilo odoslať." }, 500);
  }
});

app.get("/api/messages/:id/replies", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const id = Number(c.req.param("id"));
    const result = await c.env.DB.prepare(`
      SELECT * FROM maintenance_message_replies
      WHERE message_id=? ORDER BY id ASC
    `).bind(id).all();
    return c.json({ success: true, replies: result.results });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Odpovede sa nepodarilo načítať." }, 500);
  }
});

app.post("/api/messages/:id/reply", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const id = Number(c.req.param("id"));
    const formData = await c.req.formData();
    const actorRole = String(formData.get("actor_role") || "").trim();
    const actorName = String(formData.get("actor_name") || "").trim();
    const message = String(formData.get("message") || "").trim();

    if (!actorName || !message || !["maintenance", "maintenance_manager"].includes(actorRole)) {
      return c.json({ success: false, error: "Chýba meno alebo text odpovede." }, 400);
    }

    let photoKey: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      photoKey = await savePhoto(c.env.PHOTOS, photo, "messages/replies");
    }

    await c.env.DB.prepare(`
      INSERT INTO maintenance_message_replies(message_id,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, actorRole, actorName, message, photoKey).run();

    await c.env.DB.prepare(`
      UPDATE maintenance_messages SET updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(id).run();

    return c.json({ success: true });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Odpoveď sa nepodarilo odoslať." }, 500);
  }
});

app.post("/api/messages/:id/resolve", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const id = Number(c.req.param("id"));
    const body = await c.req.json();
    const managerName = String(body.manager_name || "").trim();
    if (!managerName) return c.json({ success: false, error: "Chýba meno vedúceho." }, 400);

    await c.env.DB.prepare(`
      UPDATE maintenance_messages
      SET status='resolved',updated_at=CURRENT_TIMESTAMP,closed_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(id).run();

    await c.env.DB.prepare(`
      INSERT INTO maintenance_message_replies(message_id,actor_role,actor_name,message,created_at)
      VALUES (?, 'maintenance_manager', ?, 'Správa bola označená ako vybavená.', CURRENT_TIMESTAMP)
    `).bind(id, managerName).run();

    return c.json({ success: true });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Správu sa nepodarilo uzavrieť." }, 500);
  }
});

app.post("/api/messages/:id/create-task", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const id = Number(c.req.param("id"));
    const body = await c.req.json();
    const managerName = String(body.manager_name || "").trim();
    if (!managerName) return c.json({ success: false, error: "Chýba meno vedúceho." }, 400);

    const message = await c.env.DB.prepare(`
      SELECT * FROM maintenance_messages WHERE id=?
    `).bind(id).first<any>();
    if (!message) return c.json({ success: false, error: "Správa nebola nájdená." }, 404);

    const result = await c.env.DB.prepare(`
      INSERT INTO issues(reporter_name,location,description,photo_key,status,last_actor_name,created_at,updated_at)
      VALUES (?, ?, ?, ?, 'new', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      managerName,
      "Požiadavka údržby",
      `${message.subject}: ${message.message}`,
      message.photo_key || null,
      managerName
    ).run();

    const issueId = result.meta.last_row_id;
    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, 'message_converted_to_task', 'maintenance_manager', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(issueId, managerName, `Vytvorené zo správy údržbára ${message.sender_name}.`, message.photo_key || null).run();

    await c.env.DB.prepare(`
      UPDATE maintenance_messages SET status='converted',updated_at=CURRENT_TIMESTAMP,closed_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(id).run();

    return c.json({ success: true, issue_id: issueId });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Zo správy sa nepodarilo vytvoriť úlohu." }, 500);
  }
});

/* =========================================================
   UPOZORNENIA A ODSTÁVKY
   ========================================================= */

app.get("/api/alerts", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const audience = String(c.req.query("audience") || "public").trim();
    const includeAll = c.req.query("all") === "1";
    const today = String(c.req.query("today") || "").trim();

    let sql = `
      SELECT * FROM alerts
      WHERE archived_at IS NULL
        AND (',' || audiences || ',') LIKE ?
    `;
    const params: unknown[] = [`%,${audience},%`];

    if (!includeAll && /^\d{4}-\d{2}-\d{2}$/.test(today)) {
      sql += ` AND start_date <= ? AND end_date >= ?`;
      params.push(today, today);
    }

    sql += ` ORDER BY start_date ASC, id DESC`;

    const result = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ success: true, alerts: result.results });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Upozornenia sa nepodarilo načítať." }, 500);
  }
});

app.post("/api/alerts", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const formData = await c.req.formData();
    const alertType = String(formData.get("alert_type") || "info").trim();
    const title = String(formData.get("title") || "").trim();
    const location = String(formData.get("location") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const startDate = String(formData.get("start_date") || "").trim();
    const endDate = String(formData.get("end_date") || "").trim();
    const audiences = String(formData.get("audiences") || "public,maintenance,management").trim();
    const createdByRole = String(formData.get("created_by_role") || "").trim();
    const createdByName = String(formData.get("created_by_name") || "").trim();

    if (!["critical", "outage", "planned", "info"].includes(alertType)) {
      return c.json({ success: false, error: "Neplatný typ upozornenia." }, 400);
    }
    if (!title || !location || !description || !startDate || !endDate || !createdByName) {
      return c.json({ success: false, error: "Vyplňte názov, miesto, popis a termín upozornenia." }, 400);
    }
    if (startDate > endDate) {
      return c.json({ success: false, error: "Koniec upozornenia nemôže byť pred začiatkom." }, 400);
    }

    let photoKey: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      photoKey = await savePhoto(c.env.PHOTOS, photo, "alerts");
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO alerts(
        alert_type,title,location,description,start_date,end_date,audiences,photo_key,
        created_by_role,created_by_name,created_at,updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      alertType, title, location, description, startDate, endDate, audiences, photoKey,
      createdByRole, createdByName
    ).run();

    return c.json({ success: true, alert_id: result.meta.last_row_id });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Upozornenie sa nepodarilo uložiť." }, 500);
  }
});

app.post("/api/alerts/:id/archive", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const id = Number(c.req.param("id"));
    await c.env.DB.prepare(`
      UPDATE alerts SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(id).run();
    return c.json({ success: true });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Upozornenie sa nepodarilo ukončiť." }, 500);
  }
});

/* =========================================================
   DIAGNOSTIKA / API 404
   ========================================================= */

app.get("/api/features-health", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    return c.json({
      success: true,
      alerts: true,
      messages: true,
      version: "1.4.2",
    });
  } catch (error) {
    console.error(error);
    return c.json({
      success: false,
      error: "Doplnkové tabuľky sa nepodarilo pripraviť.",
    }, 500);
  }
});

app.all("/api/*", (c) => {
  return c.json({
    success: false,
    error: `API endpoint neexistuje: ${c.req.method} ${c.req.path}`,
  }, 404);
});

export default app;
