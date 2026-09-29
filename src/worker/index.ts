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
    if (!issue.current_worker_name) return c.json({ success: false, error: "Pri tejto závade nie je evidovaný údržbár, ktorému by sa hodnotenie priradilo." }, 409);
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
      SELECT id,issue_id,event_type,actor_role,actor_name,message,created_at
      FROM issue_events
      WHERE event_type IN ('rating_up','rating_down')
      ORDER BY id DESC
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

export default app;
