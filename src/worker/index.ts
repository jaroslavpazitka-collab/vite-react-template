import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  MAINTENANCE_PASSWORD?: string;
  MANAGER_PASSWORD?: string;
  OPERATIONS_PASSWORD?: string;
  MAINTENANCE_PIN?: string;
  MANAGER_PIN?: string;
  MANAGER_LUBOS_PIN?: string;
  MANAGER_PETER_PIN?: string;
  MANAGER_JAROSLAV_PIN?: string;
  OPERATIONS_PIN?: string;
  LIFEGUARD_PIN?: string;
  SANITATION_PIN?: string;
  SHOPPING_PIN?: string;
  SESSION_SECRET?: string;
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

const SESSION_COOKIE = "tl_session";
const SESSION_HOURS = 12;

type StaffRole = "maintenance" | "maintenance_manager" | "operations_manager" | "lifeguard" | "sanitation";
const ALL_STAFF_ROLES: StaffRole[] = ["maintenance", "maintenance_manager", "operations_manager", "lifeguard", "sanitation"];
type StaffSession = {
  id: number;
  role: StaffRole;
  name: string;
  expires_at: string;
};

async function ensureColumn(db: D1Database, table: string, column: string, definition: string) {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all<any>();
  const exists = (info.results || []).some((row: any) => String(row.name) === column);
  if (!exists) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

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
    db.prepare(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        user_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS auth_login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT,
        auth_key TEXT,
        role TEXT NOT NULL,
        user_name TEXT NOT NULL,
        device_token TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS push_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        target_url TEXT NOT NULL DEFAULT '/',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        delivered_at TEXT,
        FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS issue_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER NOT NULL,
        event_id INTEGER,
        photo_key TEXT NOT NULL,
        photo_kind TEXT NOT NULL DEFAULT 'action',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (issue_id) REFERENCES issues(id),
        FOREIGN KEY (event_id) REFERENCES issue_events(id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS pump_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location TEXT,
        pump_name TEXT,
        power_kw TEXT,
        description TEXT,
        photo_key TEXT,
        status TEXT NOT NULL DEFAULT 'broken',
        created_by_role TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at TEXT
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS pump_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pump_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        message TEXT,
        photo_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pump_id) REFERENCES pump_records(id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS handover_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author_role TEXT NOT NULL,
        author_name TEXT NOT NULL,
        text TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        photo_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS handover_note_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL,
        author_role TEXT NOT NULL,
        author_name TEXT NOT NULL,
        text TEXT NOT NULL,
        photo_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (note_id) REFERENCES handover_notes(id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS handover_note_ack (
        note_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(note_id,user_name),
        FOREIGN KEY (note_id) REFERENCES handover_notes(id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS management_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        priority TEXT NOT NULL DEFAULT 'normal',
        owner_name TEXT,
        created_by_role TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        photo_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at TEXT
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS management_task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        author_role TEXT NOT NULL,
        author_name TEXT NOT NULL,
        text TEXT NOT NULL,
        photo_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES management_tasks(id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        due_date TEXT NOT NULL,
        due_time TEXT,
        source_note_id INTEGER,
        created_by_role TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        morning_sent_at TEXT,
        evening_sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_note_id) REFERENCES handover_notes(id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS purchase_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_name TEXT NOT NULL,
        requester_role TEXT,
        item_name TEXT NOT NULL,
        quantity TEXT,
        price TEXT,
        price_kind TEXT,
        note TEXT,
        priority TEXT NOT NULL DEFAULT 'normal',
        photo_key TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        approved_by_name TEXT,
        approved_at TEXT,
        purchased_at TEXT,
        source_issue_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS purchase_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        actor_role TEXT,
        actor_name TEXT,
        message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_id) REFERENCES purchase_requests(id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS shopping_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_maintenance_messages_status ON maintenance_messages(status)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_maintenance_message_replies_message_id ON maintenance_message_replies(message_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_alerts_dates ON alerts(start_date, end_date)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_hash ON auth_sessions(token_hash)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip ON auth_login_attempts(ip, created_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_role ON push_subscriptions(role, active)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_notifications_pending ON push_notifications(subscription_id, delivered_at, id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_issue_photos_issue ON issue_photos(issue_id, event_id, id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pump_records_status ON pump_records(status, updated_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pump_events_pump ON pump_events(pump_id, id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_handover_notes_updated ON handover_notes(updated_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_handover_comments_note ON handover_note_comments(note_id,id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_management_tasks_status ON management_tasks(status,updated_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_management_task_comments_task ON management_task_comments(task_id,id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(due_date,due_time)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_status ON purchase_requests(status,priority,created_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_requester ON purchase_requests(requester_name,created_at DESC)`),
  ]);

  // v1.6.0: rozšírenie pôvodných závad bez straty historických dát.
  await ensureColumn(db, "issues", "reporter_role", "TEXT");
  await ensureColumn(db, "issues", "destination_role", "TEXT NOT NULL DEFAULT 'maintenance'");
  await ensureColumn(db, "issues", "assignee_role", "TEXT");
  await ensureColumn(db, "issues", "assignee_name", "TEXT");
  await ensureColumn(db, "issues", "issue_type", "TEXT NOT NULL DEFAULT 'issue'");
  await ensureColumn(db, "issues", "source_record_id", "INTEGER");

  await db.prepare(`UPDATE issues SET reporter_role='public' WHERE reporter_role IS NULL OR TRIM(reporter_role)=''`).run();
  await db.prepare(`UPDATE issues SET destination_role='maintenance_manager' WHERE status='manager' AND (destination_role IS NULL OR destination_role='maintenance')`).run();
  await db.prepare(`UPDATE issues SET destination_role='operations_manager' WHERE status='operations' AND (destination_role IS NULL OR destination_role='maintenance')`).run();
  await db.prepare(`UPDATE issues SET assignee_role='maintenance',assignee_name=current_worker_name WHERE current_worker_name IS NOT NULL AND assignee_name IS NULL`).run();

  featureTablesReady = true;
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecodeBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlEncodeText(value: string) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sqlDateTime(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function slovakToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") || "";
  for (const item of cookie.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(signature));
}

async function constantTimeTextEqual(left: string, right: string) {
  const enc = new TextEncoder();
  const [aBuffer, bBuffer] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(left)),
    crypto.subtle.digest("SHA-256", enc.encode(right)),
  ]);
  const a = new Uint8Array(aBuffer);
  const b = new Uint8Array(bBuffer);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function getSession(c: any): Promise<StaffSession | null> {
  await ensureFeatureTables(c.env.DB);
  const rawToken = getCookie(c.req.raw, SESSION_COOKIE);
  const secret = String(c.env.SESSION_SECRET || "");
  if (!rawToken || !secret) return null;
  const tokenHash = await hmacHex(secret, rawToken);
  const row = await c.env.DB.prepare(`
    SELECT id, role, user_name, expires_at
    FROM auth_sessions
    WHERE token_hash=? AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `).bind(tokenHash).first();
  if (!row) return null;
  return {
    id: Number(row.id),
    role: row.role as StaffRole,
    name: String(row.user_name),
    expires_at: String(row.expires_at),
  };
}

async function requireStaff(c: any, roles?: StaffRole[]) {
  const session = await getSession(c);
  if (!session) {
    return { session: null as StaffSession | null, response: c.json({ success: false, error: "Prihlásenie vypršalo alebo nie je aktívne." }, 401) };
  }
  if (roles && !roles.includes(session.role)) {
    return { session: null as StaffSession | null, response: c.json({ success: false, error: "Na túto akciu nemáte oprávnenie." }, 403) };
  }
  return { session, response: null as Response | null };
}

function setSessionCookie(c: any, token: string) {
  const maxAge = SESSION_HOURS * 60 * 60;
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(c: any) {
  c.header("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

function roleSecret(env: Bindings, role: StaffRole) {
  if (role === "maintenance") return String(env.MAINTENANCE_PIN || env.MAINTENANCE_PASSWORD || "");
  if (role === "maintenance_manager") return String(env.MANAGER_PIN || env.MANAGER_PASSWORD || "");
  if (role === "operations_manager") return String(env.OPERATIONS_PIN || env.OPERATIONS_PASSWORD || "");
  if (role === "lifeguard") return String(env.LIFEGUARD_PIN || "");
  return String(env.SANITATION_PIN || "");
}

async function resolveLoginIdentity(env: Bindings, role: StaffRole, suppliedName: string, credential: string) {
  if (role === "maintenance_manager") {
    const managerPins: Array<[string, string]> = [
      ["Ľuboš Trizna", String(env.MANAGER_LUBOS_PIN || "")],
      ["Peter Hrabal", String(env.MANAGER_PETER_PIN || "")],
      ["Jaroslav Pažítka", String(env.MANAGER_JAROSLAV_PIN || "")],
    ];
    for (const [name, pin] of managerPins) {
      if (pin && await constantTimeTextEqual(credential, pin)) return { ok: true, name };
    }
    const fallback = String(env.MANAGER_PIN || env.MANAGER_PASSWORD || "");
    if (fallback && suppliedName && await constantTimeTextEqual(credential, fallback)) return { ok: true, name: suppliedName };
    return { ok: false, name: "" };
  }
  if (role === "operations_manager") {
    const pin = String(env.OPERATIONS_PIN || env.OPERATIONS_PASSWORD || "");
    const ok = Boolean(pin) && await constantTimeTextEqual(credential, pin);
    return { ok, name: ok ? "Vladimír Moravčík" : "" };
  }
  const pin = roleSecret(env, role);
  const ok = Boolean(pin) && await constantTimeTextEqual(credential, pin);
  return { ok, name: ok ? suppliedName : "" };
}

function roleLabel(role: StaffRole) {
  if (role === "maintenance") return "Údržba a technológia";
  if (role === "maintenance_manager") return "Vedúci Údržby a technológie";
  if (role === "operations_manager") return "Prevádzkový riaditeľ";
  if (role === "lifeguard") return "Plavčíci";
  return "Sanita";
}

function roleInitialStatus(role: StaffRole) {
  if (role === "maintenance_manager") return "manager";
  if (role === "operations_manager") return "operations";
  return "new";
}

function isStaffRole(value: string): value is StaffRole {
  return ALL_STAFF_ROLES.includes(value as StaffRole);
}

async function getSetting(db: D1Database, key: string) {
  const row = await db.prepare(`SELECT setting_value FROM app_settings WHERE setting_key=?`).bind(key).first();
  return row ? String(row.setting_value) : "";
}

async function setSetting(db: D1Database, key: string, value: string) {
  await db.prepare(`
    INSERT INTO app_settings(setting_key, setting_value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=CURRENT_TIMESTAMP
  `).bind(key, value).run();
}

async function getEncryptionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function getVapidKeys(env: Bindings) {
  await ensureFeatureTables(env.DB);
  const secret = String(env.SESSION_SECRET || "");
  if (!secret) throw new Error("Chýba SESSION_SECRET.");

  const storedPublic = await getSetting(env.DB, "vapid_public_key");
  const storedPrivate = await getSetting(env.DB, "vapid_private_encrypted");
  const storedIv = await getSetting(env.DB, "vapid_private_iv");

  if (storedPublic && storedPrivate && storedIv) {
    try {
      const key = await getEncryptionKey(secret);
      const clear = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64UrlDecodeBytes(storedIv) },
        key,
        base64UrlDecodeBytes(storedPrivate)
      );
      return { publicKey: storedPublic, privateJwk: JSON.parse(new TextDecoder().decode(clear)) as JsonWebKey };
    } catch (error) {
      console.warn("VAPID kľúč sa nepodarilo dešifrovať, vytváram nový.", error);
    }
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  ) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey;
  const privateJwk = (await crypto.subtle.exportKey("jwk", keyPair.privateKey)) as JsonWebKey;
  if (!publicJwk.x || !publicJwk.y) throw new Error("Nepodarilo sa vytvoriť VAPID verejný kľúč.");
  const rawPublic = new Uint8Array(65);
  rawPublic[0] = 4;
  rawPublic.set(base64UrlDecodeBytes(publicJwk.x), 1);
  rawPublic.set(base64UrlDecodeBytes(publicJwk.y), 33);
  const publicKey = base64UrlEncodeBytes(rawPublic);

  const encryptionKey = await getEncryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    new TextEncoder().encode(JSON.stringify(privateJwk))
  );
  await setSetting(env.DB, "vapid_public_key", publicKey);
  await setSetting(env.DB, "vapid_private_encrypted", base64UrlEncodeBytes(new Uint8Array(encrypted)));
  await setSetting(env.DB, "vapid_private_iv", base64UrlEncodeBytes(iv));
  return { publicKey, privateJwk };
}

async function createVapidAuthorization(env: Bindings, endpoint: string) {
  const { publicKey, privateJwk } = await getVapidKeys(env);
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncodeText(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64UrlEncodeText(JSON.stringify({
    aud: audience,
    exp: now + 60 * 60 * 12,
    sub: "https://vite-react-template.jaroslav-pazitka.workers.dev",
  }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const token = `${unsigned}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
  return { publicKey, authorization: `vapid t=${token}, k=${publicKey}` };
}

async function sendWakePush(env: Bindings, endpoint: string) {
  const auth = await createVapidAuthorization(env, endpoint);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      TTL: "300",
      Urgency: "high",
      Authorization: auth.authorization,
    },
  });
  return response;
}

async function notifySubscriptions(
  c: any,
  roles: StaffRole[],
  title: string,
  body: string,
  targetUrl = "/",
  userName?: string
) {
  try {
    await ensureFeatureTables(c.env.DB);
    const placeholders = roles.map(() => "?").join(",");
    let sql = `SELECT id, endpoint, user_name FROM push_subscriptions WHERE active=1 AND role IN (${placeholders})`;
    const bindings: unknown[] = [...roles];
    if (userName) {
      sql += ` AND LOWER(user_name)=LOWER(?)`;
      bindings.push(userName);
    }
    const rows = await c.env.DB.prepare(sql).bind(...bindings).all();
    const jobs = (rows.results || []).map(async (row: any) => {
      await c.env.DB.prepare(`
        INSERT INTO push_notifications(subscription_id,title,body,target_url,created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(row.id, title, body, targetUrl).run();
      try {
        const response = await sendWakePush(c.env, String(row.endpoint));
        if (response.status === 404 || response.status === 410) {
          await c.env.DB.prepare(`UPDATE push_subscriptions SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run();
        }
      } catch (error) {
        console.error("Push odoslanie zlyhalo", error);
      }
    });
    await Promise.allSettled(jobs);
  } catch (error) {
    console.error("Push notifikácie sa nepodarilo pripraviť", error);
  }
}

function scheduleNotification(
  c: any,
  roles: StaffRole[],
  title: string,
  body: string,
  targetUrl = "/",
  userName?: string
) {
  try {
    c.executionCtx.waitUntil(notifySubscriptions(c, roles, title, body, targetUrl, userName));
  } catch {
    void notifySubscriptions(c, roles, title, body, targetUrl, userName);
  }
}

function collectPhotoFiles(formData: FormData, maxPhotos = 3) {
  const entries = [...formData.getAll("photos"), ...formData.getAll("photo")];
  const seen = new Set<File>();
  const files: File[] = [];
  for (const entry of entries) {
    if (entry instanceof File && entry.size > 0 && !seen.has(entry)) {
      seen.add(entry);
      files.push(entry);
      if (files.length >= maxPhotos) break;
    }
  }
  return files;
}

async function savePhotosFromForm(bucket: R2Bucket, formData: FormData, folder: string, maxPhotos = 3) {
  const files = collectPhotoFiles(formData, maxPhotos);
  const keys: string[] = [];
  for (const file of files) keys.push(await savePhoto(bucket, file, folder));
  return keys;
}

async function insertIssueEvent(
  db: D1Database,
  issueId: number,
  eventType: string,
  actorRole: string,
  actorName: string,
  message: string,
  photoKeys: string[] = [],
  photoKind = "action"
) {
  const result = await db.prepare(`
    INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(issueId, eventType, actorRole, actorName, message || "", photoKeys[0] || null).run();
  const eventId = Number(result.meta.last_row_id);
  for (const key of photoKeys) {
    await db.prepare(`
      INSERT INTO issue_photos(issue_id,event_id,photo_key,photo_kind,created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(issueId, eventId, key, photoKind).run();
  }
  return eventId;
}

async function addIssueRootPhotos(db: D1Database, issueId: number, eventId: number, photoKeys: string[]) {
  for (const key of photoKeys) {
    await db.prepare(`
      INSERT INTO issue_photos(issue_id,event_id,photo_key,photo_kind,created_at)
      VALUES (?, ?, ?, 'original', CURRENT_TIMESTAMP)
    `).bind(issueId, eventId, key).run();
  }
}

async function notifyIssueReporter(c: any, issue: any, title: string, body: string) {
  const reporterRole = String(issue?.reporter_role || "");
  const reporterName = String(issue?.reporter_name || "").trim();
  if (isStaffRole(reporterRole) && reporterName) {
    scheduleNotification(c, [reporterRole], title, body, "/", reporterName);
  }
}

async function syncPumpFromClosedIssue(db: D1Database, issueId: number, actorRole: string, actorName: string) {
  const issue = await db.prepare(`SELECT issue_type,source_record_id FROM issues WHERE id=?`).bind(issueId).first();
  if (issue?.issue_type !== "pump_install" || !issue?.source_record_id) return;
  const pumpId = Number(issue.source_record_id);
  await db.prepare(`UPDATE pump_records SET status='installed',updated_at=CURRENT_TIMESTAMP,closed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(pumpId).run();
  await db.prepare(`
    INSERT INTO pump_events(pump_id,event_type,actor_role,actor_name,message,created_at)
    VALUES (?, 'installed', ?, ?, 'Čerpadlo bolo namontované a úloha uzavretá.', CURRENT_TIMESTAMP)
  `).bind(pumpId, actorRole, actorName).run();
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

app.post("/api/auth/login", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const body = await c.req.json();
    const role = String(body.role || "") as StaffRole;
    const suppliedName = String(body.name || "").trim();
    const credential = String(body.pin || body.password || "");
    if (!isStaffRole(role)) {
      return c.json({ success: false, error: "Neplatná rola." }, 400);
    }
    if (!credential) return c.json({ success: false, error: "Zadajte PIN." }, 400);
    if (!["maintenance_manager", "operations_manager"].includes(role) && !suppliedName) {
      return c.json({ success: false, error: "Vyberte meno a zadajte PIN." }, 400);
    }

    const sessionSecret = String(c.env.SESSION_SECRET || "");
    if (sessionSecret.length < 32) {
      return c.json({ success: false, error: "Produkčné prihlásenie ešte nie je správne nakonfigurované v Cloudflare Secrets." }, 503);
    }

    const ip = c.req.header("CF-Connecting-IP") || "unknown";
    await c.env.DB.prepare(`DELETE FROM auth_login_attempts WHERE created_at < datetime('now','-1 day')`).run();
    const recent = await c.env.DB.prepare(`
      SELECT COUNT(*) AS count FROM auth_login_attempts
      WHERE ip=? AND created_at >= datetime('now','-15 minutes')
    `).bind(ip).first();
    if (Number(recent?.count || 0) >= 10) {
      return c.json({ success: false, error: "Príliš veľa neúspešných pokusov. Skúste to o 15 minút." }, 429);
    }

    const resolved = await resolveLoginIdentity(c.env, role, suppliedName, credential);
    if (!resolved.ok || !resolved.name) {
      await c.env.DB.prepare(`INSERT INTO auth_login_attempts(ip,created_at) VALUES (?,CURRENT_TIMESTAMP)`).bind(ip).run();
      return c.json({ success: false, error: "Nesprávny PIN." }, 401);
    }
    const name = resolved.name;

    await c.env.DB.prepare(`DELETE FROM auth_login_attempts WHERE ip=?`).bind(ip).run();
    await c.env.DB.prepare(`DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP`).run();
    const token = base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await hmacHex(sessionSecret, token);
    const expiresAt = sqlDateTime(new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000));
    await c.env.DB.prepare(`
      INSERT INTO auth_sessions(token_hash,role,user_name,created_at,expires_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
    `).bind(tokenHash, role, name, expiresAt).run();
    setSessionCookie(c, token);
    return c.json({ success: true, session: { role, name, role_label: roleLabel(role), expires_at: expiresAt } });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Prihlásenie sa nepodarilo." }, 500);
  }
});

app.get("/api/auth/me", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ success: false, authenticated: false }, 401);
    return c.json({ success: true, authenticated: true, session: { role: session.role, name: session.name, expires_at: session.expires_at } });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, authenticated: false }, 500);
  }
});

app.post("/api/auth/logout", async (c) => {
  try {
    const rawToken = getCookie(c.req.raw, SESSION_COOKIE);
    const secret = String(c.env.SESSION_SECRET || "");
    if (rawToken && secret) {
      const tokenHash = await hmacHex(secret, rawToken);
      await c.env.DB.prepare(`DELETE FROM auth_sessions WHERE token_hash=?`).bind(tokenHash).run();
    }
  } catch (error) {
    console.error(error);
  }
  clearSessionCookie(c);
  return c.json({ success: true });
});

app.get("/api/push/vapid-public-key", async (c) => {
  try {
    const auth = await requireStaff(c);
    if (auth.response) return auth.response;
    const keys = await getVapidKeys(c.env);
    return c.json({ success: true, public_key: keys.publicKey });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Push notifikácie nie sú dostupné." }, 500);
  }
});

app.get("/api/push/status", async (c) => {
  const auth = await requireStaff(c);
  if (auth.response) return auth.response;
  const endpoint = String(c.req.query("endpoint") || "");
  if (!endpoint) return c.json({ success: true, active: false });
  const row = await c.env.DB.prepare(`SELECT active FROM push_subscriptions WHERE endpoint=? AND role=? AND LOWER(user_name)=LOWER(?) LIMIT 1`)
    .bind(endpoint, auth.session!.role, auth.session!.name).first();
  return c.json({ success: true, active: Boolean(row?.active) });
});

app.post("/api/push/subscribe", async (c) => {
  try {
    const auth = await requireStaff(c);
    if (auth.response) return auth.response;
    await getVapidKeys(c.env);
    const body = await c.req.json();
    const endpoint = String(body.endpoint || "").trim();
    const p256dh = String(body.keys?.p256dh || "").trim();
    const authKey = String(body.keys?.auth || "").trim();
    if (!endpoint) return c.json({ success: false, error: "Chýba push subscription endpoint." }, 400);
    const deviceToken = base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(32)));
    await c.env.DB.prepare(`
      INSERT INTO push_subscriptions(endpoint,p256dh,auth_key,role,user_name,device_token,active,created_at,updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(endpoint) DO UPDATE SET
        p256dh=excluded.p256dh,
        auth_key=excluded.auth_key,
        role=excluded.role,
        user_name=excluded.user_name,
        device_token=excluded.device_token,
        active=1,
        updated_at=CURRENT_TIMESTAMP
    `).bind(endpoint, p256dh, authKey, auth.session!.role, auth.session!.name, deviceToken).run();
    return c.json({ success: true, device_token: deviceToken });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Notifikácie sa nepodarilo aktivovať." }, 500);
  }
});

app.post("/api/push/unsubscribe", async (c) => {
  const auth = await requireStaff(c);
  if (auth.response) return auth.response;
  const body = await c.req.json();
  const endpoint = String(body.endpoint || "").trim();
  if (endpoint) {
    await c.env.DB.prepare(`UPDATE push_subscriptions SET active=0, updated_at=CURRENT_TIMESTAMP WHERE endpoint=? AND role=? AND LOWER(user_name)=LOWER(?)`)
      .bind(endpoint, auth.session!.role, auth.session!.name).run();
  }
  return c.json({ success: true });
});

app.get("/api/push/pending", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const token = String(c.req.query("token") || "").trim();
    if (!token) return c.json({ success: false }, 400);
    const subscription = await c.env.DB.prepare(`SELECT id, active FROM push_subscriptions WHERE device_token=? LIMIT 1`).bind(token).first();
    if (!subscription || !subscription.active) return c.json({ success: false }, 404);
    const row = await c.env.DB.prepare(`
      SELECT id,title,body,target_url
      FROM push_notifications
      WHERE subscription_id=? AND delivered_at IS NULL
      ORDER BY id DESC LIMIT 1
    `).bind(subscription.id).first();
    if (!row) return c.json({ success: true, notification: null });
    await c.env.DB.prepare(`UPDATE push_notifications SET delivered_at=CURRENT_TIMESTAMP WHERE subscription_id=? AND delivered_at IS NULL AND id<=?`).bind(subscription.id, row.id).run();
    return c.json({ success: true, notification: { title: row.title, body: row.body, url: row.target_url || "/" } });
  } catch (error) {
    console.error(error);
    return c.json({ success: false }, 500);
  }
});

// Centrálna ochrana interných API endpointov. Verejné hlásenie a verejné upozornenia ostávajú dostupné bez prihlásenia.
app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const method = c.req.method.toUpperCase();

  if (
    path === "/api/" ||
    path === "/api/features-health" ||
    path.startsWith("/api/auth/") ||
    path === "/api/push/pending" ||
    path === "/api/photo" ||
    (path === "/api/issues" && method === "POST") ||
    (path === "/api/purchases" && method === "POST") ||
    path.startsWith("/api/shopping/") ||
    (path === "/api/issues/duplicates" && method === "POST") ||
    (/^\/api\/issues\/\d+\/duplicate-report$/.test(path) && method === "POST") ||
    (path === "/api/alerts" && method === "GET" && (c.req.query("audience") || "public") === "public" && c.req.query("all") !== "1")
  ) {
    await next();
    return;
  }

  let roles: StaffRole[] | undefined;
  if (/^\/api\/issues\/\d+\/take$/.test(path) || /^\/api\/issues\/\d+\/status$/.test(path)) roles = ["maintenance"];
  else if (/^\/api\/issues\/\d+\/action$/.test(path)) roles = ALL_STAFF_ROLES;
  else if (/^\/api\/issues\/\d+\/manager-action$/.test(path)) roles = ["maintenance_manager"];
  else if (/^\/api\/issues\/\d+\/operations-action$/.test(path) || path === "/api/operations/tasks") roles = ["operations_manager"];
  else if (/^\/api\/issues\/\d+\/rating$/.test(path)) roles = ["maintenance_manager", "operations_manager"];
  else if (path === "/api/alerts" && method === "POST") roles = ["maintenance_manager", "operations_manager"];
  else if (/^\/api\/alerts\/\d+\/archive$/.test(path)) roles = ["maintenance_manager", "operations_manager"];
  else if (path === "/api/alerts" && method === "GET") {
    const audience = c.req.query("audience") || "public";
    if (audience === "management") roles = ["maintenance_manager", "operations_manager"];
    else if (audience === "maintenance") roles = ALL_STAFF_ROLES;
  }
  else if (path === "/api/messages" && method === "POST") roles = ["maintenance"];
  else if (/^\/api\/messages\/\d+\/(resolve|create-task)$/.test(path)) roles = ["maintenance_manager"];
  else if (/^\/api\/messages\/\d+\/reply$/.test(path)) roles = ["maintenance", "maintenance_manager"];
  else if (path.startsWith("/api/handover")) roles = ["maintenance_manager", "operations_manager"];
  else if (path.startsWith("/api/management-tasks")) roles = ["maintenance_manager", "operations_manager"];
  else if (path.startsWith("/api/reminders")) roles = ["maintenance_manager", "operations_manager"];
  else if (path === "/api/purchases" && method === "GET") roles = ALL_STAFF_ROLES;
  else if (/^\/api\/purchases\/\d+\/(approve|reject|in-stock)$/.test(path)) roles = ["operations_manager"];
  else if (path.startsWith("/api/push/")) roles = ALL_STAFF_ROLES;
  else if (path === "/api/pumps" && method === "GET") roles = ["maintenance", "maintenance_manager", "operations_manager"];
  else if (path === "/api/pumps" && method === "POST") roles = ["maintenance", "maintenance_manager"];
  else if (/^\/api\/pumps\/\d+\/(action|events)$/.test(path)) roles = ["maintenance", "maintenance_manager", "operations_manager"];

  const auth = await requireStaff(c, roles);
  if (auth.response) return auth.response;
  await next();
});

app.get("/api/photo", async (c) => {
  try {
    const key = c.req.query("key");
    if (!key) return c.text("Chýba kľúč fotografie.", 400);

    const session = await getSession(c);
    let publicAlertAllowed = false;
    if (!session && key.startsWith("alerts/")) {
      await ensureFeatureTables(c.env.DB);
      const today = slovakToday();
      const alert = await c.env.DB.prepare(`
        SELECT id FROM alerts
        WHERE photo_key=?
          AND archived_at IS NULL
          AND audiences LIKE '%public%'
          AND start_date <= ? AND end_date >= ?
        LIMIT 1
      `).bind(key, today, today).first();
      publicAlertAllowed = Boolean(alert);
    }

    if (!session && !publicAlertAllowed) return c.text("Prihlásenie je potrebné.", 401);
    const object = await c.env.PHOTOS.get(key);
    if (!object) return c.text("Fotografia nebola nájdená.", 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", publicAlertAllowed ? "public, max-age=300" : "private, max-age=300");
    return new Response(object.body, { headers });
  } catch (error) {
    console.error(error);
    return c.text("Fotografiu sa nepodarilo načítať.", 500);
  }
});

app.post("/api/issues", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const formData = await c.req.formData();
    const session = await getSession(c);
    const reporterName = session?.name || String(formData.get("reporter_name") || "").trim();
    const reporterRole = session?.role || "public";
    const location = String(formData.get("location") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const destinationRoleRaw = String(formData.get("destination_role") || "maintenance").trim();
    const destinationRole = isStaffRole(destinationRoleRaw) ? destinationRoleRaw : "maintenance";
    if (!reporterName || !location || !description) {
      return c.json({ success: false, error: "Chýba meno, miesto alebo popis závady." }, 400);
    }

    let photoKeys: string[] = [];
    try {
      photoKeys = await savePhotosFromForm(c.env.PHOTOS, formData, "issues/original", 3);
    } catch (error) {
      return c.json({ success: false, error: error instanceof Error ? error.message : "Fotografie sa nepodarilo uložiť." }, 400);
    }

    const initialStatus = roleInitialStatus(destinationRole);
    const result = await c.env.DB.prepare(`
      INSERT INTO issues (
        reporter_name,reporter_role,location,description,photo_key,status,destination_role,
        assignee_role,assignee_name,issue_type,created_at,updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'issue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      reporterName, reporterRole, location, description, photoKeys[0] || null, initialStatus, destinationRole
    ).run();
    const issueId = Number(result.meta.last_row_id);
    const eventResult = await c.env.DB.prepare(`
      INSERT INTO issue_events (issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, 'created', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      issueId, reporterRole, reporterName, `Závada bola nahlásená a adresovaná: ${roleLabel(destinationRole)}.`, photoKeys[0] || null
    ).run();
    await addIssueRootPhotos(c.env.DB, issueId, Number(eventResult.meta.last_row_id), photoKeys);

    scheduleNotification(
      c,
      [destinationRole],
      "🔧 Nová závada",
      `#${String(issueId).padStart(4, "0")} - ${location}: ${description.slice(0, 90)}`,
      "/"
    );
    return c.json({ success: true, issue_id: issueId, photo_key: photoKeys[0] || null, photo_keys: photoKeys, destination_role: destinationRole });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Nepodarilo sa uložiť závadu." }, 500);
  }
});

app.get("/api/issues", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const result = await c.env.DB.prepare(`
      SELECT
        i.id,
        i.reporter_name,
        i.reporter_role,
        i.location,
        i.description,
        i.photo_key,
        i.status,
        i.current_worker_name,
        i.assignee_role,
        i.assignee_name,
        i.destination_role,
        i.issue_type,
        i.source_record_id,
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
    `).all<any>();
    const rows = result.results || [];
    const photoResult = await c.env.DB.prepare(`SELECT issue_id,event_id,photo_key,photo_kind FROM issue_photos ORDER BY id`).all<any>();
    const byIssue = new Map<number, string[]>();
    for (const photo of photoResult.results || []) {
      const issueId = Number(photo.issue_id);
      const arr = byIssue.get(issueId) || [];
      if (!arr.includes(String(photo.photo_key))) arr.push(String(photo.photo_key));
      byIssue.set(issueId, arr);
    }
    const issues = rows.map((row: any) => ({
      ...row,
      destination_role: row.destination_role || (row.status === 'manager' ? 'maintenance_manager' : row.status === 'operations' ? 'operations_manager' : 'maintenance'),
      assignee_name: row.assignee_name || row.current_worker_name || null,
      photo_keys: byIssue.get(Number(row.id)) || (row.photo_key ? [row.photo_key] : []),
    }));
    return c.json({ success: true, issues });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Nepodarilo sa načítať závady." }, 500);
  }
});

app.post("/api/issues/:id/action", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const session = await getSession(c);
    if (!session) return c.json({ success: false, error: "Prihlásenie vypršalo." }, 401);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, error: "Neplatné číslo závady." }, 400);
    const formData = await c.req.formData();
    const action = String(formData.get("action") || "").trim();
    const message = String(formData.get("message") || "").trim();
    const targetRaw = String(formData.get("target_role") || "").trim();
    const targetRole = isStaffRole(targetRaw) ? targetRaw : null;
    if (!["take", "takeover", "material", "transfer", "close", "comment", "reopen"].includes(action)) {
      return c.json({ success: false, error: "Neplatná akcia." }, 400);
    }

    const issue = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
    if (!issue) return c.json({ success: false, error: "Závada nebola nájdená." }, 404);
    const destinationRole = isStaffRole(String(issue.destination_role || ""))
      ? String(issue.destination_role) as StaffRole
      : (issue.status === "manager" ? "maintenance_manager" : issue.status === "operations" ? "operations_manager" : "maintenance");
    const canWork = destinationRole === session.role || session.role === "maintenance_manager";
    if (!canWork && action !== "reopen") {
      return c.json({ success: false, error: `Závada je aktuálne adresovaná: ${roleLabel(destinationRole)}.` }, 403);
    }
    if (action === "reopen" && !["maintenance_manager", "operations_manager"].includes(session.role)) {
      return c.json({ success: false, error: "Znovu otvoriť závadu môže vedúci alebo prevádzkový manažér." }, 403);
    }

    let photoKeys: string[] = [];
    try {
      photoKeys = await savePhotosFromForm(c.env.PHOTOS, formData, `issues/actions/${action}`, 3);
    } catch (error) {
      return c.json({ success: false, error: error instanceof Error ? error.message : "Fotografie sa nepodarilo uložiť." }, 400);
    }

    let eventType = action;
    let defaultMessage = "";
    const hadAssignee = Boolean(issue.assignee_name || issue.current_worker_name);

    if (action === "take" || action === "takeover") {
      if (issue.status === "closed") return c.json({ success: false, error: "Uzavretú závadu nie je možné prevziať." }, 409);
      const wasDifferent = hadAssignee && String(issue.assignee_name || issue.current_worker_name).toLowerCase() !== session.name.toLowerCase();
      eventType = wasDifferent ? "taken_over" : "taken";
      defaultMessage = wasDifferent
        ? `${session.name} prevzal závadu od kolegu.`
        : `${session.name} prevzal závadu.`;
      await c.env.DB.prepare(`
        UPDATE issues
        SET status='progress',assignee_role=?,assignee_name=?,current_worker_name=CASE WHEN ?='maintenance' THEN ? ELSE current_worker_name END,
            last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=?
      `).bind(session.role, session.name, session.role, session.name, session.name, id).run();
      if (!hadAssignee) {
        await notifyIssueReporter(c, issue, "🔧 Vaša závada bola prevzatá", `Závadu #${String(id).padStart(4, "0")} prevzal ${session.name}.`);
      }
    } else if (action === "material") {
      if (issue.status === "closed") return c.json({ success: false, error: "Uzavretú závadu nie je možné meniť." }, 409);
      eventType = "material_requested";
      defaultMessage = "Závada čaká na materiál.";
      await c.env.DB.prepare(`
        UPDATE issues SET status='material',last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL WHERE id=?
      `).bind(session.name, id).run();
    } else if (action === "transfer") {
      if (!targetRole) return c.json({ success: false, error: "Vyberte, komu chcete závadu posunúť." }, 400);
      if (issue.status === "closed") return c.json({ success: false, error: "Uzavretú závadu najprv znovu otvorte." }, 409);
      eventType = "transferred";
      defaultMessage = `Závada bola posunutá: ${roleLabel(session.role)} → ${roleLabel(targetRole)}.`;
      const targetStatus = roleInitialStatus(targetRole);
      await c.env.DB.prepare(`
        UPDATE issues
        SET status=?,destination_role=?,assignee_role=NULL,assignee_name=NULL,current_worker_name=NULL,
            last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=?
      `).bind(targetStatus, targetRole, session.name, id).run();
      scheduleNotification(c, [targetRole], "↪️ Nová pridelená závada", `Závada #${String(id).padStart(4, "0")} bola adresovaná: ${roleLabel(targetRole)}.`, "/");
    } else if (action === "close") {
      if (issue.status === "closed") return c.json({ success: false, error: "Závada je už uzavretá." }, 409);
      eventType = "resolved";
      defaultMessage = "Závada bola vyriešená a uzavretá.";
      await c.env.DB.prepare(`
        UPDATE issues
        SET status='closed',assignee_role=?,assignee_name=?,current_worker_name=CASE WHEN ?='maintenance' THEN ? ELSE current_worker_name END,
            last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(session.role, session.name, session.role, session.name, session.name, id).run();
      await notifyIssueReporter(c, issue, "✅ Vaša závada bola vyriešená", `Závada #${String(id).padStart(4, "0")} bola vyriešená.`);
      await syncPumpFromClosedIssue(c.env.DB, id, session.role, session.name);
    } else if (action === "comment") {
      eventType = "comment";
      defaultMessage = "Doplnená poznámka k závade.";
      await c.env.DB.prepare(`UPDATE issues SET last_actor_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(session.name, id).run();
    } else if (action === "reopen") {
      if (issue.status !== "closed") return c.json({ success: false, error: "Znovu otvoriť je možné iba uzavretú závadu." }, 409);
      const reopenTarget = targetRole || destinationRole;
      eventType = "reopened";
      defaultMessage = `Závada bola znovu otvorená a adresovaná: ${roleLabel(reopenTarget)}.`;
      await c.env.DB.prepare(`
        UPDATE issues
        SET status=?,destination_role=?,assignee_role=NULL,assignee_name=NULL,current_worker_name=NULL,
            last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=?
      `).bind(roleInitialStatus(reopenTarget), reopenTarget, session.name, id).run();
      scheduleNotification(c, [reopenTarget], "↻ Závada znovu otvorená", `Závada #${String(id).padStart(4, "0")} je znovu otvorená.`, "/");
    }

    await insertIssueEvent(
      c.env.DB,
      id,
      eventType,
      session.role,
      session.name,
      message || defaultMessage,
      photoKeys,
      action === "close" ? "resolved" : "action"
    );
    const updated = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
    return c.json({ success: true, issue: updated, photo_keys: photoKeys });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Akciu sa nepodarilo uložiť." }, 500);
  }
});

app.post("/api/issues/:id/take", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, error: "Neplatné číslo závady." }, 400);
    const body = await c.req.json();
    const session = await getSession(c);
    const workerName = session?.name || String(body.worker_name || "").trim();
    if (!workerName) return c.json({ success: false, error: "Chýba meno údržbára." }, 400);
    const issueBeforeTake = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
    const updateResult = await c.env.DB.prepare(`
      UPDATE issues SET status='progress',destination_role='maintenance',assignee_role='maintenance',assignee_name=?,current_worker_name=?,last_actor_name=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='new'
    `).bind(workerName, workerName, workerName, id).run();
    if (!updateResult.meta.changes) return c.json({ success: false, error: "Závadu už pravdepodobne prevzal iný pracovník." }, 409);
    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,created_at)
      VALUES (?, 'taken', 'maintenance', ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, workerName, "Údržbár prevzal závadu.").run();
    if (issueBeforeTake) {
      await notifyIssueReporter(c, issueBeforeTake, "🔧 Vaša závada bola prevzatá", `Závadu #${String(id).padStart(4, "0")} prevzal ${workerName}.`);
    }
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
    const session = await getSession(c);
    const workerName = session?.name || String(formData.get("worker_name") || "").trim();
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
      UPDATE issues SET status=?,destination_role=CASE WHEN ? IN ('manager','material') THEN 'maintenance_manager' ELSE destination_role END,
        assignee_role=CASE WHEN ? IN ('manager','material') THEN NULL ELSE assignee_role END,
        assignee_name=CASE WHEN ? IN ('manager','material') THEN NULL ELSE assignee_name END,
        last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=${closedSql}
      WHERE id=? AND status='progress'
    `).bind(status, status, status, status, workerName, id).run();
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
    if (status === "closed") {
      const issueForNotify = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
      if (issueForNotify) await notifyIssueReporter(c, issueForNotify, "✅ Vaša závada bola vyriešená", `Závada #${String(id).padStart(4, "0")} bola vyriešená.`);
      await syncPumpFromClosedIssue(c.env.DB, id, "maintenance", workerName);
    }
    if (status === "material") {
      scheduleNotification(c, ["maintenance_manager"], "📦 Čaká na materiál", `Závada #${String(id).padStart(4, "0")} čaká na materiál.`, "/");
    } else if (status === "manager") {
      scheduleNotification(c, ["maintenance_manager"], "🛠️ Závada posunutá vedúcemu", `Závada #${String(id).padStart(4, "0")} vyžaduje rozhodnutie vedúceho.`, "/");
    }
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
    const session = await getSession(c);
    const managerName = session?.name || String(formData.get("manager_name") || "").trim();
    const action = String(formData.get("action") || "").trim();
    const message = String(formData.get("message") || "").trim();
    if (!managerName) return c.json({ success: false, error: "Chýba meno vedúceho údržby." }, 400);
    if (!["return", "close", "operations", "reopen"].includes(action)) return c.json({ success: false, error: "Neplatná akcia vedúceho." }, 400);
    if (!message) return c.json({ success: false, error: "Napíšte krátky komentár k akcii." }, 400);

    const currentIssue = await c.env.DB.prepare(`SELECT status FROM issues WHERE id=?`).bind(id).first<{ status: string }>();
    if (!currentIssue) return c.json({ success: false, error: "Závada nebola nájdená." }, 404);

    if (["return", "operations"].includes(action) && !["manager", "material"].includes(currentIssue.status)) {
      return c.json({ success: false, error: "Táto akcia je dostupná iba pri závade u vedúceho alebo čakajúcej na materiál." }, 409);
    }
    if (action === "close" && currentIssue.status === "closed") {
      return c.json({ success: false, error: "Úloha je už uzavretá." }, 409);
    }
    if (action === "reopen" && currentIssue.status !== "closed") {
      return c.json({ success: false, error: "Znovu otvoriť je možné iba uzavretú úlohu." }, 409);
    }

    let photoKey: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      let folder = "issues/manager-actions";
      if (action === "close") folder = "issues/manager-resolved";
      if (action === "operations") folder = "issues/operations";
      if (action === "reopen") folder = "issues/reopened";
      try {
        photoKey = await savePhoto(c.env.PHOTOS, photo, folder);
      } catch (error) {
        return c.json({ success: false, error: error instanceof Error ? error.message : "Fotografiu sa nepodarilo uložiť." }, 400);
      }
    }

    let eventType = "";
    if (action === "return") {
      await c.env.DB.prepare(`
        UPDATE issues SET status='new',destination_role='maintenance',assignee_role=NULL,assignee_name=NULL,current_worker_name=NULL,last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=? AND status IN ('manager','material')
      `).bind(managerName, id).run();
      eventType = "returned_to_maintenance";
    } else if (action === "close") {
      await c.env.DB.prepare(`
        UPDATE issues SET status='closed',last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=CURRENT_TIMESTAMP
        WHERE id=? AND status<>'closed'
      `).bind(managerName, id).run();
      eventType = "manager_resolved";
    } else if (action === "operations") {
      await c.env.DB.prepare(`
        UPDATE issues SET status='operations',destination_role='operations_manager',assignee_role=NULL,assignee_name=NULL,last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=? AND status IN ('manager','material')
      `).bind(managerName, id).run();
      eventType = "escalated_to_operations";
    } else if (action === "reopen") {
      await c.env.DB.prepare(`
        UPDATE issues SET status='new',destination_role='maintenance',assignee_role=NULL,assignee_name=NULL,current_worker_name=NULL,last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=? AND status='closed'
      `).bind(managerName, id).run();
      eventType = "reopened_by_manager";
    }

    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, ?, 'maintenance_manager', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, eventType, managerName, message, photoKey).run();
    const updatedIssue = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
    if (action === "close") {
      const issueForNotify = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
      if (issueForNotify) await notifyIssueReporter(c, issueForNotify, "✅ Vaša závada bola vyriešená", `Závada #${String(id).padStart(4, "0")} bola vyriešená.`);
      await syncPumpFromClosedIssue(c.env.DB, id, "maintenance_manager", managerName);
    }
    if (action === "return" || action === "reopen") {
      scheduleNotification(c, ["maintenance"], action === "reopen" ? "↻ Závada znovu otvorená" : "↩️ Závada vrátená údržbe", `Závada #${String(id).padStart(4, "0")} je opäť medzi novými úlohami.`, "/");
    } else if (action === "operations") {
      scheduleNotification(c, ["operations_manager"], "📊 Závada posunutá prevádzke", `Závada #${String(id).padStart(4, "0")} vyžaduje rozhodnutie prevádzkového manažéra.`, "/");
    }
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
    const session = await getSession(c);
    const operationsName = session?.name || String(formData.get("operations_name") || "").trim();
    const action = String(formData.get("action") || "").trim();
    const message = String(formData.get("message") || "").trim();
    if (!operationsName) return c.json({ success: false, error: "Chýba meno prevádzkového manažéra." }, 400);
    if (!["return_manager", "close", "reopen"].includes(action)) return c.json({ success: false, error: "Neplatná akcia prevádzkového manažéra." }, 400);
    if (!message) return c.json({ success: false, error: "Napíšte krátky komentár k rozhodnutiu." }, 400);

    const currentIssue = await c.env.DB.prepare(`SELECT status FROM issues WHERE id=?`).bind(id).first<{ status: string }>();
    if (!currentIssue) return c.json({ success: false, error: "Závada nebola nájdená." }, 404);
    if (action === "return_manager" && currentIssue.status !== "operations") {
      return c.json({ success: false, error: "Vrátiť vedúcemu je možné iba závadu, ktorá je u prevádzkového manažéra." }, 409);
    }
    if (action === "close" && currentIssue.status === "closed") {
      return c.json({ success: false, error: "Úloha je už uzavretá." }, 409);
    }
    if (action === "reopen" && currentIssue.status !== "closed") {
      return c.json({ success: false, error: "Znovu otvoriť je možné iba uzavretú úlohu." }, 409);
    }

    let photoKey: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      try {
        const folder = action === "close"
          ? "issues/operations-resolved"
          : action === "reopen"
          ? "issues/reopened"
          : "issues/operations-returned";
        photoKey = await savePhoto(c.env.PHOTOS, photo, folder);
      } catch (error) {
        return c.json({ success: false, error: error instanceof Error ? error.message : "Fotografiu sa nepodarilo uložiť." }, 400);
      }
    }

    let eventType = "";
    if (action === "close") {
      await c.env.DB.prepare(`
        UPDATE issues SET status='closed',last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=CURRENT_TIMESTAMP
        WHERE id=? AND status<>'closed'
      `).bind(operationsName, id).run();
      eventType = "operations_resolved";
    } else if (action === "reopen") {
      await c.env.DB.prepare(`
        UPDATE issues SET status='new',destination_role='maintenance',assignee_role=NULL,assignee_name=NULL,current_worker_name=NULL,last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=? AND status='closed'
      `).bind(operationsName, id).run();
      eventType = "reopened_by_operations";
    } else {
      await c.env.DB.prepare(`
        UPDATE issues SET status='manager',destination_role='maintenance_manager',assignee_role=NULL,assignee_name=NULL,last_actor_name=?,updated_at=CURRENT_TIMESTAMP,closed_at=NULL
        WHERE id=? AND status='operations'
      `).bind(operationsName, id).run();
      eventType = "returned_to_manager";
    }

    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, ?, 'operations_manager', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, eventType, operationsName, message, photoKey).run();
    const updatedIssue = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
    if (action === "close") {
      const issueForNotify = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
      if (issueForNotify) await notifyIssueReporter(c, issueForNotify, "✅ Vaša závada bola vyriešená", `Závada #${String(id).padStart(4, "0")} bola vyriešená.`);
      await syncPumpFromClosedIssue(c.env.DB, id, "operations_manager", operationsName);
    }
    if (action === "return_manager") {
      scheduleNotification(c, ["maintenance_manager"], "↩️ Úloha vrátená vedúcemu", `Závada #${String(id).padStart(4, "0")} bola vrátená vedúcemu údržby.`, "/");
    } else if (action === "reopen") {
      scheduleNotification(c, ["maintenance"], "↻ Závada znovu otvorená", `Závada #${String(id).padStart(4, "0")} je opäť medzi novými úlohami.`, "/");
    }
    return c.json({ success: true, issue: updatedIssue, photo_key: photoKey });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Rozhodnutie sa nepodarilo uložiť." }, 500);
  }
});

app.post("/api/operations/tasks", async (c) => {
  try {
    const formData = await c.req.formData();
    const session = await getSession(c);
    const operationsName = session?.name || String(formData.get("operations_name") || "").trim();
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
      INSERT INTO issues (reporter_name,reporter_role,location,description,photo_key,status,destination_role,issue_type,last_actor_name,created_at,updated_at)
      VALUES (?, 'operations_manager', ?, ?, ?, 'manager', 'maintenance_manager', 'issue', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(operationsName, location, description, photoKey, operationsName).run();
    const issueId = result.meta.last_row_id;
    await c.env.DB.prepare(`
      INSERT INTO issue_events(issue_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, 'operations_task_created', 'operations_manager', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(issueId, operationsName, "Prevádzkový manažér vytvoril novú úlohu pre vedúceho údržby.", photoKey).run();
    scheduleNotification(c, ["maintenance_manager"], "📋 Nová úloha od prevádzky", `Nová úloha #${String(issueId).padStart(4, "0")} čaká na vedúceho údržby.`, "/");
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
    const session = await getSession(c);
    const actorName = session?.name || String(body.actor_name || "").trim();
    const actorRole = session?.role || String(body.actor_role || "").trim();
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
    `).bind(id).all<any>();
    const photos = await c.env.DB.prepare(`
      SELECT event_id,photo_key FROM issue_photos WHERE issue_id=? AND event_id IS NOT NULL ORDER BY id
    `).bind(id).all<any>();
    const byEvent = new Map<number, string[]>();
    for (const photo of photos.results || []) {
      const eventId = Number(photo.event_id);
      const arr = byEvent.get(eventId) || [];
      if (!arr.includes(String(photo.photo_key))) arr.push(String(photo.photo_key));
      byEvent.set(eventId, arr);
    }
    const events = (result.results || []).map((row: any) => ({
      ...row,
      photo_keys: byEvent.get(Number(row.id)) || (row.photo_key ? [row.photo_key] : []),
    }));
    return c.json({ success: true, events });
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
      SELECT id, location, description, NULL AS photo_key, status, created_at, updated_at
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

    const photoKeys = await savePhotosFromForm(c.env.PHOTOS, formData, "issues/duplicate-reports", 3);
    const session = await getSession(c);
    const actorRole = session?.role || "reporter";
    const actorName = session?.name || reporterName;

    const message = [
      "Ďalšie hlásenie rovnakej závady.",
      location ? `Miesto: ${location}.` : "",
      `Popis: ${description}`,
    ].filter(Boolean).join(" ");

    await insertIssueEvent(c.env.DB, id, "duplicate_report", actorRole, actorName, message, photoKeys, "duplicate_report");

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
    const session = await getSession(c);
    if (!session) return c.json({ success: false, error: "Prihlásenie je potrebné." }, 401);

    let result;
    if (session.role === "maintenance_manager") {
      result = await c.env.DB.prepare(`
        SELECT m.*,
          (SELECT COUNT(*) FROM maintenance_message_replies r WHERE r.message_id=m.id) AS reply_count
        FROM maintenance_messages m
        ORDER BY CASE WHEN m.status='open' THEN 0 ELSE 1 END, m.updated_at DESC, m.id DESC
      `).all();
    } else if (session.role === "maintenance") {
      result = await c.env.DB.prepare(`
        SELECT m.*,
          (SELECT COUNT(*) FROM maintenance_message_replies r WHERE r.message_id=m.id) AS reply_count
        FROM maintenance_messages m
        WHERE LOWER(TRIM(m.sender_name)) = LOWER(TRIM(?))
        ORDER BY m.updated_at DESC, m.id DESC
      `).bind(session.name).all();
    } else {
      return c.json({ success: false, error: "Táto sekcia je určená údržbe a vedúcemu údržby." }, 403);
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
    const session = await getSession(c);
    const senderName = session?.name || String(formData.get("sender_name") || "").trim();
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

    scheduleNotification(c, ["maintenance_manager"], "💬 Nová správa od údržby", `${senderName}: ${subject || message.slice(0, 80)}`, "/");
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
    const session = await getSession(c);
    if (!session) return c.json({ success: false, error: "Prihlásenie je potrebné." }, 401);
    const original = await c.env.DB.prepare(`SELECT sender_name FROM maintenance_messages WHERE id=?`).bind(id).first();
    if (!original) return c.json({ success: false, error: "Správa nebola nájdená." }, 404);
    if (session.role === "operations_manager" || (session.role === "maintenance" && String(original.sender_name).toLocaleLowerCase() !== session.name.toLocaleLowerCase())) {
      return c.json({ success: false, error: "K tejto správe nemáte prístup." }, 403);
    }
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
    const session = await getSession(c);
    if (!session || !["maintenance", "maintenance_manager"].includes(session.role)) {
      return c.json({ success: false, error: "Na túto správu nemáte oprávnenie odpovedať." }, 403);
    }
    const originalMessage = await c.env.DB.prepare(`SELECT sender_name FROM maintenance_messages WHERE id=?`).bind(id).first();
    if (!originalMessage) return c.json({ success: false, error: "Správa nebola nájdená." }, 404);
    if (session.role === "maintenance" && String(originalMessage.sender_name).toLocaleLowerCase() !== session.name.toLocaleLowerCase()) {
      return c.json({ success: false, error: "K tejto správe nemáte prístup." }, 403);
    }
    const actorRole = session.role;
    const actorName = session.name;
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

    if (actorRole === "maintenance_manager") {
      if (originalMessage?.sender_name) scheduleNotification(c, ["maintenance"], "💬 Odpoveď vedúceho", `Vedúci odpovedal na vašu správu.`, "/", String(originalMessage.sender_name));
    } else {
      scheduleNotification(c, ["maintenance_manager"], "💬 Nová odpoveď údržby", `${actorName} doplnil správu.`, "/");
    }
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
    const session = await getSession(c);
    const managerName = session?.name || String(body.manager_name || "").trim();
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

    const original = await c.env.DB.prepare(`SELECT sender_name FROM maintenance_messages WHERE id=?`).bind(id).first();
    if (original?.sender_name) scheduleNotification(c, ["maintenance"], "✅ Správa vybavená", "Vedúci označil vašu správu ako vybavenú.", "/", String(original.sender_name));

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
    const session = await getSession(c);
    const managerName = session?.name || String(body.manager_name || "").trim();
    if (!managerName) return c.json({ success: false, error: "Chýba meno vedúceho." }, 400);

    const message = await c.env.DB.prepare(`
      SELECT * FROM maintenance_messages WHERE id=?
    `).bind(id).first();
    if (!message) return c.json({ success: false, error: "Správa nebola nájdená." }, 404);

    const result = await c.env.DB.prepare(`
      INSERT INTO issues(reporter_name,reporter_role,location,description,photo_key,status,destination_role,issue_type,last_actor_name,created_at,updated_at)
      VALUES (?, 'maintenance_manager', ?, ?, ?, 'new', 'maintenance', 'issue', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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

    scheduleNotification(c, ["maintenance"], "📋 Nová úloha zo správy", `Zo správy vznikla nová úloha #${String(issueId).padStart(4, "0")}.`, "/");
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
    const session = await getSession(c);
    const createdByRole = session?.role || String(formData.get("created_by_role") || "").trim();
    const createdByName = session?.name || String(formData.get("created_by_name") || "").trim();

    if (!["critical", "outage", "planned", "info"].includes(alertType)) {
      return c.json({ success: false, error: "Neplatný typ upozornenia." }, 400);
    }
    if (!startDate || !endDate || !createdByName) {
      return c.json({ success: false, error: "Vyberte termín upozornenia." }, 400);
    }
    if (!title && !description) {
      return c.json({ success: false, error: "Vyplňte aspoň názov alebo popis upozornenia." }, 400);
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

    const notifyRolesList: StaffRole[] = [];
    if (audiences.includes("maintenance")) notifyRolesList.push("maintenance");
    if (audiences.includes("management")) notifyRolesList.push("maintenance_manager", "operations_manager");
    if (notifyRolesList.length && ["critical", "outage"].includes(alertType)) {
      scheduleNotification(
        c,
        Array.from(new Set(notifyRolesList)),
        alertType === "critical" ? "⚠️ Kritické upozornenie" : "🟠 Odstávka",
        title || description.slice(0, 90),
        "/"
      );
    }

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
   ČERPADLÁ - JEDNODUCHÁ EVIDENCIA OPRÁV
   ========================================================= */

app.get("/api/pumps", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const result = await c.env.DB.prepare(`
      SELECT p.*,
        COALESCE((SELECT COUNT(*) FROM pump_events e WHERE e.pump_id=p.id),0) AS event_count
      FROM pump_records p
      ORDER BY p.updated_at DESC,p.id DESC
    `).all<any>();
    return c.json({ success: true, pumps: result.results || [] });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Evidenciu čerpadiel sa nepodarilo načítať." }, 500);
  }
});

app.post("/api/pumps", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const session = await getSession(c);
    if (!session || !["maintenance", "maintenance_manager"].includes(session.role)) {
      return c.json({ success: false, error: "Na vytvorenie záznamu nemáte oprávnenie." }, 403);
    }
    const formData = await c.req.formData();
    const location = String(formData.get("location") || "").trim();
    const pumpName = String(formData.get("pump_name") || "").trim();
    const powerKw = String(formData.get("power_kw") || "").trim();
    const description = String(formData.get("description") || "").trim();
    let photoKey: string | null = null;
    const photo = collectPhotoFiles(formData, 1)[0];
    if (photo) photoKey = await savePhoto(c.env.PHOTOS, photo, "pumps/original");

    const result = await c.env.DB.prepare(`
      INSERT INTO pump_records(location,pump_name,power_kw,description,photo_key,status,created_by_role,created_by_name,created_at,updated_at)
      VALUES (?, ?, ?, ?, ?, 'broken', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(location || null, pumpName || null, powerKw || null, description || null, photoKey, session.role, session.name).run();
    const pumpId = Number(result.meta.last_row_id);
    await c.env.DB.prepare(`
      INSERT INTO pump_events(pump_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, 'created', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(pumpId, session.role, session.name, description || "Založený záznam poruchy čerpadla.", photoKey).run();
    return c.json({ success: true, pump_id: pumpId });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: error instanceof Error ? error.message : "Záznam čerpadla sa nepodarilo vytvoriť." }, 500);
  }
});

app.get("/api/pumps/:id/events", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    const result = await c.env.DB.prepare(`SELECT * FROM pump_events WHERE pump_id=? ORDER BY id DESC`).bind(id).all<any>();
    return c.json({ success: true, events: result.results || [] });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Históriu čerpadla sa nepodarilo načítať." }, 500);
  }
});

app.post("/api/pumps/:id/action", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const session = await getSession(c);
    if (!session || !["maintenance", "maintenance_manager"].includes(session.role)) {
      return c.json({ success: false, error: "Na úpravu evidencie čerpadiel nemáte oprávnenie." }, 403);
    }
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, error: "Neplatné číslo čerpadla." }, 400);
    const pump = await c.env.DB.prepare(`SELECT * FROM pump_records WHERE id=?`).bind(id).first();
    if (!pump) return c.json({ success: false, error: "Záznam čerpadla nebol nájdený." }, 404);

    const formData = await c.req.formData();
    const action = String(formData.get("action") || "").trim();
    const message = String(formData.get("message") || "").trim();
    if (!["broken", "send_repair", "returned_stock", "returned_install", "installed", "comment"].includes(action)) {
      return c.json({ success: false, error: "Neplatná akcia čerpadla." }, 400);
    }
    let photoKey: string | null = null;
    const photo = collectPhotoFiles(formData, 1)[0];
    if (photo) photoKey = await savePhoto(c.env.PHOTOS, photo, `pumps/${action}`);

    let nextStatus = String(pump.status || "broken");
    let eventMessage = message;
    if (action === "broken") {
      nextStatus = "broken";
      eventMessage ||= "Čerpadlo označené ako pokazené.";
    } else if (action === "send_repair") {
      nextStatus = "repair";
      eventMessage ||= "Čerpadlo odoslané do opravy.";
    } else if (action === "returned_stock") {
      nextStatus = "stock";
      eventMessage ||= "Čerpadlo sa vrátilo z opravy a bolo uložené na sklad.";
    } else if (action === "returned_install") {
      nextStatus = "install";
      eventMessage ||= "Čerpadlo sa vrátilo z opravy a čaká na montáž.";
    } else if (action === "installed") {
      nextStatus = "installed";
      eventMessage ||= "Čerpadlo bolo namontované a je funkčné.";
    } else {
      eventMessage ||= "Doplnená poznámka k čerpadlu.";
    }

    const closedAt = ["stock", "installed"].includes(nextStatus) ? "CURRENT_TIMESTAMP" : "NULL";
    await c.env.DB.prepare(`
      UPDATE pump_records SET status=?,updated_at=CURRENT_TIMESTAMP,closed_at=${closedAt} WHERE id=?
    `).bind(nextStatus, id).run();
    await c.env.DB.prepare(`
      INSERT INTO pump_events(pump_id,event_type,actor_role,actor_name,message,photo_key,created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, action, session.role, session.name, eventMessage, photoKey).run();

    let issueId: number | null = null;
    if (action === "returned_install") {
      const location = String(pump.location || "").trim();
      const pumpLabel = String(pump.pump_name || "Čerpadlo").trim() || "Čerpadlo";
      const description = `Namontovať čerpadlo po oprave: ${pumpLabel}${pump.power_kw ? ` • ${pump.power_kw} kW` : ""}.`;
      const issueResult = await c.env.DB.prepare(`
        INSERT INTO issues(
          reporter_name,reporter_role,location,description,photo_key,status,destination_role,
          assignee_role,assignee_name,issue_type,source_record_id,last_actor_name,created_at,updated_at
        ) VALUES (?, ?, ?, ?, ?, 'new', 'maintenance', NULL, NULL, 'pump_install', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(session.name, session.role, location || "Čerpadlo - montáž", description, pump.photo_key || photoKey || null, id, session.name).run();
      issueId = Number(issueResult.meta.last_row_id);
      await insertIssueEvent(
        c.env.DB,
        issueId,
        "pump_install_created",
        session.role,
        session.name,
        `Čerpadlo #${id} prišlo z opravy a bolo zaradené medzi úlohy na montáž.`,
        [],
        "action"
      );
      scheduleNotification(c, ["maintenance"], "🔩 Čerpadlo na montáž", `Čerpadlo #${id} prišlo z opravy a čaká na montáž.`, "/");
    }

    const updated = await c.env.DB.prepare(`SELECT * FROM pump_records WHERE id=?`).bind(id).first();
    return c.json({ success: true, pump: updated, issue_id: issueId });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: error instanceof Error ? error.message : "Zmenu čerpadla sa nepodarilo uložiť." }, 500);
  }
});

/* =========================================================
   v1.7.0 – ODKAZY, ÚLOHY, PRIPOMIENKY A NÁKUPY
   ========================================================= */

const SHOPPING_COOKIE = "tl_shopping";

function setShoppingCookie(c: any, token: string) {
  c.header("Set-Cookie", `${SHOPPING_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
}

function clearShoppingCookie(c: any) {
  c.header("Set-Cookie", `${SHOPPING_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

async function hasShoppingSession(c: any) {
  await ensureFeatureTables(c.env.DB);
  const raw = getCookie(c.req.raw, SHOPPING_COOKIE);
  const secret = String(c.env.SESSION_SECRET || "");
  if (!raw || !secret) return false;
  const hash = await hmacHex(secret, raw);
  const row = await c.env.DB.prepare(`SELECT id FROM shopping_sessions WHERE token_hash=? AND expires_at>CURRENT_TIMESTAMP`).bind(hash).first();
  return Boolean(row);
}

async function notifyNamedUser(c: any, roleRaw: string | null | undefined, nameRaw: string | null | undefined, title: string, body: string) {
  const role = String(roleRaw || "");
  const name = String(nameRaw || "").trim();
  if (isStaffRole(role) && name) scheduleNotification(c, [role], title, body, "/", name);
}

app.get("/api/handover", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const session = await getSession(c);
  if (!session || !["maintenance_manager", "operations_manager"].includes(session.role)) return c.json({ success:false,error:"Bez oprávnenia." },403);
  const rows = await c.env.DB.prepare(`
    SELECT n.*,
      CASE WHEN a.note_id IS NULL THEN 0 ELSE 1 END AS acknowledged,
      (SELECT COUNT(*) FROM handover_note_comments cc WHERE cc.note_id=n.id) AS comment_count,
      (SELECT MAX(created_at) FROM handover_note_comments cc WHERE cc.note_id=n.id) AS last_comment_at
    FROM handover_notes n
    LEFT JOIN handover_note_ack a ON a.note_id=n.id AND LOWER(a.user_name)=LOWER(?)
    ORDER BY CASE WHEN n.priority='urgent' THEN 0 ELSE 1 END, n.updated_at DESC, n.id DESC
  `).bind(session.name).all<any>();
  return c.json({ success:true, notes:rows.results || [] });
});

app.post("/api/handover", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const session = await getSession(c);
  if (!session || !["maintenance_manager", "operations_manager"].includes(session.role)) return c.json({ success:false,error:"Bez oprávnenia." },403);
  const form = await c.req.formData();
  const value = String(form.get("text") || "").trim();
  const priority = String(form.get("priority") || "normal") === "urgent" ? "urgent" : "normal";
  if (!value) return c.json({ success:false,error:"Napíšte odkaz." },400);
  let photoKey:string|null=null;
  const photo = collectPhotoFiles(form,1)[0];
  if (photo) photoKey = await savePhoto(c.env.PHOTOS, photo, "handover");
  const result = await c.env.DB.prepare(`INSERT INTO handover_notes(author_role,author_name,text,priority,photo_key,created_at,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(session.role,session.name,value,priority,photoKey).run();
  const id=Number(result.meta.last_row_id);
  scheduleNotification(c,["maintenance_manager","operations_manager"], priority === "urgent" ? "🔴 Súrny odkaz medzi vedúcimi" : "💬 Nový odkaz medzi vedúcimi", `${session.name}: ${value.slice(0,120)}`, "/");
  return c.json({ success:true,id });
});

app.post("/api/handover/:id/ack", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const session=await getSession(c);
  if (!session || !["maintenance_manager","operations_manager"].includes(session.role)) return c.json({success:false,error:"Bez oprávnenia."},403);
  const id=Number(c.req.param("id"));
  await c.env.DB.prepare(`INSERT INTO handover_note_ack(note_id,user_name,acknowledged_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(note_id,user_name) DO UPDATE SET acknowledged_at=CURRENT_TIMESTAMP`).bind(id,session.name).run();
  return c.json({success:true});
});

app.get("/api/handover/:id/comments", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const id=Number(c.req.param("id"));
  const rows=await c.env.DB.prepare(`SELECT * FROM handover_note_comments WHERE note_id=? ORDER BY id`).bind(id).all<any>();
  return c.json({success:true,comments:rows.results||[]});
});

app.post("/api/handover/:id/comments", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const session=await getSession(c);
  if (!session || !["maintenance_manager","operations_manager"].includes(session.role)) return c.json({success:false,error:"Bez oprávnenia."},403);
  const id=Number(c.req.param("id"));
  const form=await c.req.formData();
  const value=String(form.get("text")||"").trim();
  if (!value) return c.json({success:false,error:"Napíšte komentár."},400);
  let photoKey:string|null=null;
  const photo=collectPhotoFiles(form,1)[0];
  if(photo) photoKey=await savePhoto(c.env.PHOTOS,photo,"handover/comments");
  await c.env.DB.prepare(`INSERT INTO handover_note_comments(note_id,author_role,author_name,text,photo_key,created_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,session.role,session.name,value,photoKey).run();
  await c.env.DB.prepare(`UPDATE handover_notes SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  // Nová reakcia znovu aktivuje odkaz všetkým, ktorí si ho už odklikli.
  await c.env.DB.prepare(`DELETE FROM handover_note_ack WHERE note_id=?`).bind(id).run();
  scheduleNotification(c,["maintenance_manager","operations_manager"],"💬 Nová reakcia k odkazu",`${session.name}: ${value.slice(0,120)}`,"/");
  return c.json({success:true});
});

app.get("/api/management-tasks", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const rows=await c.env.DB.prepare(`SELECT *, (SELECT COUNT(*) FROM management_task_comments cc WHERE cc.task_id=t.id) AS comment_count FROM management_tasks t ORDER BY CASE WHEN priority='urgent' THEN 0 ELSE 1 END, CASE WHEN status='closed' THEN 1 ELSE 0 END, updated_at DESC`).all<any>();
  return c.json({success:true,tasks:rows.results||[]});
});

app.post("/api/management-tasks", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const session=await getSession(c);
  if(!session || !["maintenance_manager","operations_manager"].includes(session.role)) return c.json({success:false,error:"Bez oprávnenia."},403);
  const form=await c.req.formData();
  const title=String(form.get("title")||"").trim();
  const description=String(form.get("description")||"").trim();
  const priority=String(form.get("priority")||"normal")==="urgent"?"urgent":"normal";
  const owner=String(form.get("owner_name")||"").trim()||null;
  if(!title) return c.json({success:false,error:"Zadajte názov úlohy."},400);
  let photoKey:string|null=null; const photo=collectPhotoFiles(form,1)[0]; if(photo) photoKey=await savePhoto(c.env.PHOTOS,photo,"management-tasks");
  const result=await c.env.DB.prepare(`INSERT INTO management_tasks(title,description,status,priority,owner_name,created_by_role,created_by_name,photo_key,created_at,updated_at) VALUES (?,?,?, ?,?,?,?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(title,description,owner?"progress":"new",priority,owner,session.role,session.name,photoKey).run();
  scheduleNotification(c,["maintenance_manager","operations_manager"], priority==="urgent"?"🔴 Nová súrna úloha":"✅ Nová úloha",title,"/");
  return c.json({success:true,id:Number(result.meta.last_row_id)});
});

app.get("/api/management-tasks/:id/comments", async (c) => {
  const id=Number(c.req.param("id"));
  const rows=await c.env.DB.prepare(`SELECT * FROM management_task_comments WHERE task_id=? ORDER BY id`).bind(id).all<any>();
  return c.json({success:true,comments:rows.results||[]});
});

app.post("/api/management-tasks/:id/action", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const session=await getSession(c);
  if(!session || !["maintenance_manager","operations_manager"].includes(session.role)) return c.json({success:false,error:"Bez oprávnenia."},403);
  const id=Number(c.req.param("id")); const form=await c.req.formData();
  const action=String(form.get("action")||""); const message=String(form.get("message")||"").trim(); const status=String(form.get("status")||"").trim();
  let photoKey:string|null=null; const photo=collectPhotoFiles(form,1)[0]; if(photo) photoKey=await savePhoto(c.env.PHOTOS,photo,"management-tasks/comments");
  if(action==="take") await c.env.DB.prepare(`UPDATE management_tasks SET owner_name=?,status='progress',updated_at=CURRENT_TIMESTAMP,closed_at=NULL WHERE id=?`).bind(session.name,id).run();
  else if(action==="assign") { const owner=String(form.get("owner_name")||"").trim(); await c.env.DB.prepare(`UPDATE management_tasks SET owner_name=?,status=CASE WHEN ?='' THEN 'new' ELSE 'progress' END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(owner||null,owner,id).run(); }
  else if(action==="status") { const allowed=["new","progress","quote","decision","realization","closed"]; if(!allowed.includes(status)) return c.json({success:false,error:"Neplatný stav."},400); await c.env.DB.prepare(`UPDATE management_tasks SET status=?,updated_at=CURRENT_TIMESTAMP,closed_at=CASE WHEN ?='closed' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?`).bind(status,status,id).run(); }
  else if(action==="reopen") await c.env.DB.prepare(`UPDATE management_tasks SET status='progress',closed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  else if(action!=="comment") return c.json({success:false,error:"Neplatná akcia."},400);
  if(message || photoKey) await c.env.DB.prepare(`INSERT INTO management_task_comments(task_id,author_role,author_name,text,photo_key,created_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,session.role,session.name,message||"Aktualizácia úlohy",photoKey).run();
  scheduleNotification(c,["maintenance_manager","operations_manager"],"📝 Aktualizácia úlohy",message||"Úloha bola aktualizovaná.","/");
  return c.json({success:true});
});

app.get("/api/reminders", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const scope=String(c.req.query("scope")||"today");
  const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Bratislava",year:"numeric",month:"2-digit",day:"2-digit"});
  const today=formatter.format(new Date());
  const sql=scope==="all"?`SELECT * FROM reminders WHERE due_date>=? ORDER BY due_date,due_time,id`:`SELECT * FROM reminders WHERE due_date=? ORDER BY COALESCE(due_time,'23:59'),id`;
  const rows=await c.env.DB.prepare(sql).bind(today).all<any>();
  return c.json({success:true,reminders:rows.results||[],today});
});

app.post("/api/reminders", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const session=await getSession(c); if(!session || !["maintenance_manager","operations_manager"].includes(session.role)) return c.json({success:false,error:"Bez oprávnenia."},403);
  const body=await c.req.json(); const title=String(body.title||"").trim(); const dueDate=String(body.due_date||"").trim(); const dueTime=String(body.due_time||"").trim()||null; const sourceNote=Number(body.source_note_id||0)||null;
  if(!title || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return c.json({success:false,error:"Doplňte názov a dátum."},400);
  const r=await c.env.DB.prepare(`INSERT INTO reminders(title,due_date,due_time,source_note_id,created_by_role,created_by_name,created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(title,dueDate,dueTime,sourceNote,session.role,session.name).run();
  return c.json({success:true,id:Number(r.meta.last_row_id)});
});

app.delete("/api/reminders/:id", async (c) => {
  const session=await getSession(c); if(!session || !["maintenance_manager","operations_manager"].includes(session.role)) return c.json({success:false,error:"Bez oprávnenia."},403);
  await c.env.DB.prepare(`DELETE FROM reminders WHERE id=?`).bind(Number(c.req.param("id"))).run(); return c.json({success:true});
});

app.post("/api/purchases", async (c) => {
  await ensureFeatureTables(c.env.DB);
  const session=await getSession(c);
  const form=await c.req.formData();
  const requesterName=session?.name || String(form.get("requester_name")||"").trim();
  const requesterRole=session?.role || "public";
  const item=String(form.get("item_name")||"").trim();
  if(!requesterName) return c.json({success:false,error:"Meno žiadateľa je povinné."},400);
  if(!item) return c.json({success:false,error:"Napíšte, čo treba kúpiť."},400);
  const quantity=String(form.get("quantity")||"").trim(); const price=String(form.get("price")||"").trim(); const priceKind=String(form.get("price_kind")||"").trim(); const note=String(form.get("note")||"").trim(); const priority=String(form.get("priority")||"normal")==="urgent"?"urgent":"normal";
  let photoKey:string|null=null; const photo=collectPhotoFiles(form,1)[0]; if(photo) photoKey=await savePhoto(c.env.PHOTOS,photo,"purchases");
  const r=await c.env.DB.prepare(`INSERT INTO purchase_requests(requester_name,requester_role,item_name,quantity,price,price_kind,note,priority,photo_key,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(requesterName,requesterRole,item,quantity,price,priceKind,note,priority,photoKey).run();
  const id=Number(r.meta.last_row_id); await c.env.DB.prepare(`INSERT INTO purchase_events(purchase_id,event_type,actor_role,actor_name,message,created_at) VALUES (?,'created',?,?,?,CURRENT_TIMESTAMP)`).bind(id,requesterRole,requesterName,item).run();
  scheduleNotification(c,["operations_manager"], priority==="urgent"?"🛒 Súrna požiadavka na nákup":"🛒 Nová požiadavka na nákup",`${requesterName}: ${item}`,"/");
  return c.json({success:true,id});
});

app.get("/api/purchases", async (c) => {
  await ensureFeatureTables(c.env.DB); const session=await getSession(c); if(!session) return c.json({success:false,error:"Prihlásenie vypršalo."},401);
  const scope=String(c.req.query("scope")||"mine");
  let rows;
  if(scope==="all" && session.role==="operations_manager") rows=await c.env.DB.prepare(`SELECT * FROM purchase_requests ORDER BY CASE WHEN priority='urgent' THEN 0 ELSE 1 END, created_at DESC`).all<any>();
  else rows=await c.env.DB.prepare(`SELECT * FROM purchase_requests WHERE LOWER(requester_name)=LOWER(?) ORDER BY created_at DESC`).bind(session.name).all<any>();
  return c.json({success:true,purchases:rows.results||[]});
});

app.post("/api/purchases/:id/approve", async (c) => {
  await ensureFeatureTables(c.env.DB); const session=await getSession(c); if(!session || session.role!=="operations_manager") return c.json({success:false,error:"Bez oprávnenia."},403); const id=Number(c.req.param("id"));
  const row=await c.env.DB.prepare(`SELECT * FROM purchase_requests WHERE id=?`).bind(id).first(); if(!row) return c.json({success:false,error:"Požiadavka neexistuje."},404);
  await c.env.DB.prepare(`UPDATE purchase_requests SET status='approved',approved_by_name=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(session.name,id).run();
  await c.env.DB.prepare(`INSERT INTO purchase_events(purchase_id,event_type,actor_role,actor_name,message,created_at) VALUES (?,'approved',?,?,?,CURRENT_TIMESTAMP)`).bind(id,session.role,session.name,'Schválené').run();
  await notifyNamedUser(c,String(row.requester_role ?? ""),String(row.requester_name ?? ""),"✅ Nákup schválený",`${row.item_name} bol schválený na nákup.`); return c.json({success:true});
});

app.post("/api/purchases/:id/reject", async (c) => {
  await ensureFeatureTables(c.env.DB); const session=await getSession(c); if(!session || session.role!=="operations_manager") return c.json({success:false,error:"Bez oprávnenia."},403); const id=Number(c.req.param("id")); const body=await c.req.json().catch(()=>({})); const reason=String(body.reason||"").trim();
  const row=await c.env.DB.prepare(`SELECT * FROM purchase_requests WHERE id=?`).bind(id).first(); if(!row) return c.json({success:false,error:"Požiadavka neexistuje."},404);
  await c.env.DB.prepare(`UPDATE purchase_requests SET status='rejected',rejection_reason=?,approved_by_name=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(reason,session.name,id).run();
  await notifyNamedUser(c,String(row.requester_role ?? ""),String(row.requester_name ?? ""),"❌ Nákup zamietnutý",`${row.item_name}${reason?`: ${reason}`:"."}`); return c.json({success:true});
});

app.post("/api/purchases/:id/in-stock", async (c) => {
  await ensureFeatureTables(c.env.DB); const session=await getSession(c); if(!session || session.role!=="operations_manager") return c.json({success:false,error:"Bez oprávnenia."},403); const id=Number(c.req.param("id")); const row=await c.env.DB.prepare(`SELECT * FROM purchase_requests WHERE id=?`).bind(id).first(); if(!row) return c.json({success:false,error:"Požiadavka neexistuje."},404);
  await c.env.DB.prepare(`UPDATE purchase_requests SET status='in_stock',approved_by_name=?,approved_at=CURRENT_TIMESTAMP,purchased_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(session.name,id).run(); await notifyNamedUser(c,String(row.requester_role ?? ""),String(row.requester_name ?? ""),"📦 Položka je na sklade",`${row.item_name} je dostupný na sklade.`); return c.json({success:true});
});

app.post("/api/shopping/login", async (c) => {
  await ensureFeatureTables(c.env.DB); const body=await c.req.json(); const pin=String(body.pin||""); const configured=String(c.env.SHOPPING_PIN||""); if(!configured) return c.json({success:false,error:"PIN nákupného zoznamu nie je nastavený."},503); if(!(await constantTimeTextEqual(pin,configured))) return c.json({success:false,error:"Nesprávny PIN."},401);
  const secret=String(c.env.SESSION_SECRET||""); const token=base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(32))); const hash=await hmacHex(secret,token); const expires=sqlDateTime(new Date(Date.now()+12*60*60*1000)); await c.env.DB.prepare(`INSERT INTO shopping_sessions(token_hash,created_at,expires_at) VALUES (?,CURRENT_TIMESTAMP,?)`).bind(hash,expires).run(); setShoppingCookie(c,token); return c.json({success:true});
});

app.post("/api/shopping/logout", async (c) => { const raw=getCookie(c.req.raw,SHOPPING_COOKIE); if(raw && c.env.SESSION_SECRET){ const hash=await hmacHex(String(c.env.SESSION_SECRET),raw); await c.env.DB.prepare(`DELETE FROM shopping_sessions WHERE token_hash=?`).bind(hash).run(); } clearShoppingCookie(c); return c.json({success:true}); });

app.get("/api/shopping/list", async (c) => { if(!(await hasShoppingSession(c))) return c.json({success:false,error:"Zadajte PIN."},401); await ensureFeatureTables(c.env.DB); const rows=await c.env.DB.prepare(`SELECT * FROM purchase_requests WHERE status='approved' ORDER BY CASE WHEN priority='urgent' THEN 0 ELSE 1 END, approved_at,id`).all<any>(); const history=await c.env.DB.prepare(`SELECT * FROM purchase_requests WHERE status IN ('purchased','in_stock') ORDER BY COALESCE(purchased_at,updated_at) DESC LIMIT 100`).all<any>(); return c.json({success:true,purchases:rows.results||[],history:history.results||[]}); });

app.post("/api/shopping/:id/purchased", async (c) => { if(!(await hasShoppingSession(c))) return c.json({success:false,error:"Zadajte PIN."},401); const id=Number(c.req.param("id")); const row=await c.env.DB.prepare(`SELECT * FROM purchase_requests WHERE id=? AND status='approved'`).bind(id).first(); if(!row) return c.json({success:false,error:"Položka nie je v nákupnom zozname."},404); await c.env.DB.prepare(`UPDATE purchase_requests SET status='purchased',purchased_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run(); await notifyNamedUser(c,String(row.requester_role ?? ""),String(row.requester_name ?? ""),"🛍️ Nákup vybavený",`${row.item_name} bol nakúpený.`); return c.json({success:true}); });

app.get("/api/worker-stats", async (c) => {
  await ensureFeatureTables(c.env.DB); const session=await getSession(c); if(!session || !["maintenance_manager","operations_manager"].includes(session.role)) return c.json({success:false,error:"Bez oprávnenia."},403);
  const rows=await c.env.DB.prepare(`
    SELECT e.actor_name,
      SUM(CASE WHEN e.event_type IN ('taken','taken_over') THEN 1 ELSE 0 END) AS taken_count,
      SUM(CASE WHEN e.event_type='resolved' THEN 1 ELSE 0 END) AS resolved_count,
      ROUND(AVG(CASE WHEN e.event_type='resolved' THEN (julianday(e.created_at)-julianday(i.created_at))*24.0 END),1) AS avg_hours
    FROM issue_events e JOIN issues i ON i.id=e.issue_id
    WHERE e.actor_name IS NOT NULL AND TRIM(e.actor_name)<>''
    GROUP BY e.actor_name ORDER BY resolved_count DESC,taken_count DESC,e.actor_name
  `).all<any>();
  return c.json({success:true,workers:rows.results||[]});
});


/* =========================================================
   DIAGNOSTIKA / API 404
   ========================================================= */

app.get("/api/features-health", async (c) => {
  try {
    await ensureFeatureTables(c.env.DB);
    const securityReady = Boolean(
      roleSecret(c.env, "maintenance") &&
      c.env.MANAGER_LUBOS_PIN && c.env.MANAGER_PETER_PIN && c.env.MANAGER_JAROSLAV_PIN &&
      roleSecret(c.env, "operations_manager") &&
      roleSecret(c.env, "lifeguard") &&
      roleSecret(c.env, "sanitation") &&
      c.env.SHOPPING_PIN &&
      c.env.SESSION_SECRET &&
      String(c.env.SESSION_SECRET).length >= 32
    );
    return c.json({
      success: true,
      version: "1.7.0",
      alerts: true,
      messages: true,
      offline_drafts: true,
      multi_department: true,
      multi_photo: true,
      pumps: true,
      handover_notes: true,
      management_tasks: true,
      reminders: true,
      purchases: true,
      individual_manager_pin: true,
      pin_login: true,
      push: true,
      production_auth_ready: securityReady,
    });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, version: "1.7.0" }, 500);
  }
});

async function runReminderSchedule(env: Bindings) {
  await ensureFeatureTables(env.DB);
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Bratislava", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", hour12:false }).formatToParts(now);
  const get = (type:string) => parts.find((p:any)=>p.type===type)?.value || "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  const localDate = new Date(`${today}T12:00:00Z`);
  const tomorrowDate = new Date(localDate.getTime()+86400000);
  const tomorrow = `${tomorrowDate.getUTCFullYear()}-${String(tomorrowDate.getUTCMonth()+1).padStart(2,"0")}-${String(tomorrowDate.getUTCDate()).padStart(2,"0")}`;
  const fakeC:any = { env };
  if (hour === 7) {
    const rows = await env.DB.prepare(`SELECT * FROM reminders WHERE due_date=? AND morning_sent_at IS NULL ORDER BY id`).bind(today).all<any>();
    for (const row of rows.results || []) {
      await notifySubscriptions(fakeC,["maintenance_manager","operations_manager"],"🔔 Dnešná pripomienka",`${row.due_time ? row.due_time+" • " : ""}${row.title}`,"/");
      await env.DB.prepare(`UPDATE reminders SET morning_sent_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run();
    }
  }
  if (hour === 19) {
    const rows = await env.DB.prepare(`SELECT * FROM reminders WHERE due_date=? AND evening_sent_at IS NULL ORDER BY id`).bind(tomorrow).all<any>();
    for (const row of rows.results || []) {
      await notifySubscriptions(fakeC,["maintenance_manager","operations_manager"],"📅 Zajtra vás čaká",`${row.due_time ? row.due_time+" • " : ""}${row.title}`,"/");
      await env.DB.prepare(`UPDATE reminders SET evening_sent_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run();
    }
  }
}

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runReminderSchedule(env));
  },
};
