import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/", (c) => {
  return c.json({ name: "Tatralandia údržba API" });
});

app.post("/api/issues", async (c) => {
  try {
    const body = await c.req.json();

    const reporterName = String(body.reporter_name || "").trim();
    const location = String(body.location || "").trim();
    const description = String(body.description || "").trim();

    if (!reporterName || !location || !description) {
      return c.json(
        {
          success: false,
          error: "Chýba meno, miesto alebo popis závady.",
        },
        400
      );
    }

    const result = await c.env.DB.prepare(
      `
      INSERT INTO issues (
        reporter_name,
        location,
        description,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `
    )
      .bind(reporterName, location, description)
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
        created_at
      )
      VALUES (?, 'created', 'reporter', ?, ?, CURRENT_TIMESTAMP)
      `
    )
      .bind(issueId, reporterName, description)
      .run();

    return c.json({
      success: true,
      issue_id: issueId,
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

app.get("/api/issues", async (c) => {
  try {
    const status = c.req.query("status");

    let query = `
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
    `;

    const values: string[] = [];

    if (status) {
      query += ` WHERE status = ?`;
      values.push(status);
    }

    query += ` ORDER BY id DESC`;

    const statement = c.env.DB.prepare(query);

    const result =
      values.length > 0
        ? await statement.bind(...values).all()
        : await statement.all();

    return c.json({
      success: true,
      issues: result.results,
    });
  } catch (error) {
    console.error(error);

    return c.json(
      {
        success: false,
        error: "Nepodarilo sa načítať závady.",
      },
      500
    );
  }
});

export default app;
