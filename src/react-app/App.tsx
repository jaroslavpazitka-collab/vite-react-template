import { useState } from "react";
import tatralandiaLogo from "./assets/tatralandia-logo.jpg";
import "./App.css";

type Screen =
  | "home"
  | "report"
  | "success"
  | "maintenance-login"
  | "maintenance-dashboard"
  | "maintenance-issue";

type MaintenanceFilter =
  | "new"
  | "progress"
  | "material"
  | "manager";

type Issue = {
  id: number;
  reporter_name: string;
  location: string;
  description: string;
  photo_key: string | null;
  status: string;
  current_worker_name: string | null;
  last_actor_name: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

function App() {
  const [screen, setScreen] = useState<Screen>("home");

  /* ========================================================
     NAHLÁSENIE
     ======================================================== */

  const [reporter, setReporter] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photoName, setPhotoName] = useState("");

  /* ========================================================
     ÚDRŽBÁR
     ======================================================== */

  const [maintenanceName, setMaintenanceName] = useState("");
  const [maintenancePassword, setMaintenancePassword] =
    useState("");

  const [
    loggedMaintenanceName,
    setLoggedMaintenanceName,
  ] = useState("");

  const [maintenanceFilter, setMaintenanceFilter] =
    useState<MaintenanceFilter>("new");

  const [issues, setIssues] = useState<Issue[]>([]);

  const [issuesLoading, setIssuesLoading] =
    useState(false);

  const [selectedIssue, setSelectedIssue] =
    useState<Issue | null>(null);

  const [actionLoading, setActionLoading] =
    useState(false);

  /* ========================================================
     NAČÍTANIE ZÁVAD
     ======================================================== */

  const loadIssues = async () => {
    try {
      setIssuesLoading(true);

      const response = await fetch("/api/issues");

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(
          data.error ||
            "Nepodarilo sa načítať závady."
        );
        return;
      }

      setIssues(data.issues || []);
    } catch (error) {
      console.error(error);

      alert("Nepodarilo sa načítať závady.");
    } finally {
      setIssuesLoading(false);
    }
  };

  /* ========================================================
     NOVÁ ZÁVADA
     ======================================================== */

  const submitReport = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (
      !reporter.trim() ||
      !location.trim() ||
      !description.trim()
    ) {
      alert(
        "Prosím, vyplňte meno, miesto a popis závady."
      );
      return;
    }

    try {
      const response = await fetch("/api/issues", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          reporter_name: reporter.trim(),
          location: location.trim(),
          description: description.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(
          data.error ||
            "Závadu sa nepodarilo odoslať."
        );

        return;
      }

      setScreen("success");
    } catch (error) {
      console.error(error);

      alert(
        "Nepodarilo sa spojiť so serverom."
      );
    }
  };

  const resetReport = () => {
    setReporter("");
    setLocation("");
    setDescription("");
    setPhotoName("");
    setScreen("home");
  };

  /* ========================================================
     PRIHLÁSENIE ÚDRŽBY
     ======================================================== */

  const loginMaintenance = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!maintenanceName.trim()) {
      alert("Napíšte svoje meno.");
      return;
    }

    /*
      ZATIAĽ TESTOVACIE HESLO.
      Neskôr ho presunieme bezpečne na server.
    */

    if (maintenancePassword !== "test1234") {
      alert("Nesprávne heslo.");
      return;
    }

    setLoggedMaintenanceName(
      maintenanceName.trim()
    );

    await loadIssues();

    setMaintenanceFilter("new");

    setScreen("maintenance-dashboard");
  };

  const logoutMaintenance = () => {
    setMaintenancePassword("");
    setMaintenanceName("");
    setLoggedMaintenanceName("");

    setIssues([]);
    setSelectedIssue(null);

    setMaintenanceFilter("new");

    setScreen("home");
  };

  /* ========================================================
     DETAIL ZÁVADY
     ======================================================== */

  const openIssue = (issue: Issue) => {
    setSelectedIssue(issue);

    setScreen("maintenance-issue");
  };

  const takeIssue = async () => {
    if (!selectedIssue) return;

    if (!loggedMaintenanceName.trim()) {
      alert("Nie je známe meno údržbára.");
      return;
    }

    try {
      setActionLoading(true);

      const response = await fetch(
        `/api/issues/${selectedIssue.id}/take`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            worker_name:
              loggedMaintenanceName.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(
          data.error ||
            "Závadu sa nepodarilo prevziať."
        );

        await loadIssues();

        return;
      }

      setSelectedIssue(data.issue);

      await loadIssues();

      alert(
        `Závadu #${String(
          selectedIssue.id
        ).padStart(
          4,
          "0"
        )} ste úspešne prevzali.`
      );
    } catch (error) {
      console.error(error);

      alert(
        "Pri preberaní závady nastala chyba."
      );
    } finally {
      setActionLoading(false);
    }
  };

  /* ========================================================
     FILTRE
     ======================================================== */

  const filteredIssues = issues.filter(
    (issue) =>
      issue.status === maintenanceFilter
  );

  const newCount = issues.filter(
    (issue) => issue.status === "new"
  ).length;

  const progressCount = issues.filter(
    (issue) => issue.status === "progress"
  ).length;

  const materialCount = issues.filter(
    (issue) => issue.status === "material"
  ).length;

  const managerCount = issues.filter(
    (issue) => issue.status === "manager"
  ).length;

  const filterTitle: Record<
    MaintenanceFilter,
    string
  > = {
    new: "Nové závady",
    progress: "Rozpracované",
    material: "Čaká na materiál",
    manager: "Posunuté vedúcemu",
  };

  /* ========================================================
     DÁTUM
     ======================================================== */

  const formatDate = (dateValue: string) => {
    if (!dateValue) return "";

    let normalized = dateValue;

    if (!normalized.includes("T")) {
      normalized = normalized.replace(" ", "T");
    }

    if (
      !normalized.endsWith("Z") &&
      !normalized.includes("+")
    ) {
      normalized += "Z";
    }

    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }

    return date.toLocaleString("sk-SK", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /* ========================================================
     TEXT STAVU
     ======================================================== */

  const statusLabel = (status: string) => {
    switch (status) {
      case "new":
        return "Nová závada";

      case "progress":
        return "Rozpracovaná";

      case "material":
        return "Čaká na materiál";

      case "manager":
        return "U vedúceho";

      case "closed":
        return "Vyriešená";

      default:
        return status;
    }
  };

  /* ========================================================
     DETAIL ZÁVADY
     ======================================================== */

  if (
    screen === "maintenance-issue" &&
    selectedIssue
  ) {
    return (
      <main className="app-shell">
        <section className="app-card issue-detail-card">

          <div className="top-bar">

            <button
              className="back-button"
              onClick={() =>
                setScreen(
                  "maintenance-dashboard"
                )
              }
            >
              ← Závady
            </button>

            <img
              src={tatralandiaLogo}
              alt="Tatralandia"
              className="small-logo"
            />

          </div>

          <div className="issue-detail-number">
            ZÁVADA #
            {String(
              selectedIssue.id
            ).padStart(4, "0")}
          </div>

          <div
            className={`issue-detail-status status-${selectedIssue.status}`}
          >
            {statusLabel(
              selectedIssue.status
            )}
          </div>

          <h1 className="issue-detail-title">
            {selectedIssue.description}
          </h1>

          <div className="issue-detail-box">

            <div className="detail-row">
              <span className="detail-icon">
                📍
              </span>

              <div>
                <small>
                  KDE SA ZÁVADA NACHÁDZA
                </small>

                <strong>
                  {selectedIssue.location}
                </strong>
              </div>
            </div>

            <div className="detail-row">
              <span className="detail-icon">
                👤
              </span>

              <div>
                <small>NAHLÁSIL</small>

                <strong>
                  {
                    selectedIssue.reporter_name
                  }
                </strong>
              </div>
            </div>

            <div className="detail-row">
              <span className="detail-icon">
                🕐
              </span>

              <div>
                <small>
                  NAHLÁSENÉ
                </small>

                <strong>
                  {formatDate(
                    selectedIssue.created_at
                  )}
                </strong>
              </div>
            </div>

          </div>

          <div className="detail-description">
            <small>POPIS ZÁVADY</small>

            <p>
              {selectedIssue.description}
            </p>
          </div>

          {selectedIssue.photo_key ? (
            <img
              src={selectedIssue.photo_key}
              alt="Fotografia závady"
              className="detail-photo"
            />
          ) : (
            <div className="detail-photo-placeholder">
              <span>📷</span>

              <strong>
                Fotografia nebola priložená
              </strong>

              <small>
                Nahrávanie fotografií
                doplníme cez R2.
              </small>
            </div>
          )}

          {selectedIssue.status ===
            "new" && (
            <button
              className="take-issue-button"
              onClick={takeIssue}
              disabled={actionLoading}
            >
              {actionLoading
                ? "Preberám..."
                : "🔧 Prevziať závadu"}
            </button>
          )}

          {selectedIssue.status ===
            "progress" && (
            <div className="issue-being-solved">

              <div className="issue-being-solved-icon">
                🔧
              </div>

              <div>
                <small>
                  ZÁVADA JE V RIEŠENÍ
                </small>

                <strong>
                  Prevzal:{" "}
                  {selectedIssue.current_worker_name ||
                    "Údržba"}
                </strong>
              </div>

            </div>
          )}

          <button
            className="detail-back-button"
            onClick={() => {
              setMaintenanceFilter(
                selectedIssue.status ===
                  "progress"
                  ? "progress"
                  : "new"
              );

              setScreen(
                "maintenance-dashboard"
              );
            }}
          >
            Späť na prehľad
          </button>

        </section>
      </main>
    );
  }

  /* ========================================================
     DASHBOARD ÚDRŽBY
     ======================================================== */

  if (
    screen === "maintenance-dashboard"
  ) {
    return (
      <main className="app-shell">

        <section className="app-card dashboard-card">

          <div className="dashboard-header">

            <img
              src={tatralandiaLogo}
              alt="Tatralandia"
              className="dashboard-logo"
            />

            <button
              className="logout-button"
              onClick={
                logoutMaintenance
              }
            >
              Odhlásiť
            </button>

          </div>

          <div className="welcome-block">

            <div>
              <span>
                PRIHLÁSENÝ ÚDRŽBÁR
              </span>

              <h2>
                {
                  loggedMaintenanceName
                }
              </h2>
            </div>

            <div className="worker-avatar">
              🔧
            </div>

          </div>

          <div className="dashboard-title-row">

            <div>

              <div className="section-label">
                PREHĽAD ÚDRŽBY
              </div>

              <h1>Závady</h1>

            </div>

            <button
              className="notification-bell"
              onClick={async () => {
                setMaintenanceFilter(
                  "new"
                );

                await loadIssues();
              }}
            >
              🔔

              {newCount > 0 && (
                <span>
                  {newCount}
                </span>
              )}

            </button>

          </div>

          <div className="stats-grid">

            <button
              className={`stat-card ${
                maintenanceFilter ===
                "new"
                  ? "stat-active"
                  : ""
              }`}
              onClick={() =>
                setMaintenanceFilter(
                  "new"
                )
              }
            >
              <span className="stat-number">
                {newCount}
              </span>

              <span className="stat-title">
                Nové závady
              </span>

              <small>
                Čakajú na prevzatie
              </small>
            </button>

            <button
              className={`stat-card ${
                maintenanceFilter ===
                "progress"
                  ? "stat-active"
                  : ""
              }`}
              onClick={() =>
                setMaintenanceFilter(
                  "progress"
                )
              }
            >
              <span className="stat-number">
                {progressCount}
              </span>

              <span className="stat-title">
                Rozpracované
              </span>

              <small>
                Aktuálne riešené
              </small>
            </button>

            <button
              className={`stat-card ${
                maintenanceFilter ===
                "material"
                  ? "stat-active"
                  : ""
              }`}
              onClick={() =>
                setMaintenanceFilter(
                  "material"
                )
              }
            >
              <span className="stat-number">
                {materialCount}
              </span>

              <span className="stat-title">
                Čaká na materiál
              </span>

              <small>
                Potrebná súčinnosť
              </small>
            </button>

            <button
              className={`stat-card ${
                maintenanceFilter ===
                "manager"
                  ? "stat-active"
                  : ""
              }`}
              onClick={() =>
                setMaintenanceFilter(
                  "manager"
                )
              }
            >
              <span className="stat-number">
                {managerCount}
              </span>

              <span className="stat-title">
                U vedúceho
              </span>

              <small>
                Posunuté ďalej
              </small>
            </button>

          </div>

          <div className="dashboard-section">

            <div className="dashboard-section-heading">

              <strong>
                {
                  filterTitle[
                    maintenanceFilter
                  ]
                }
              </strong>

              <span>
                {
                  filteredIssues.length
                }{" "}
                položiek
              </span>

            </div>

            <div className="issue-list">

              {issuesLoading ? (

                <div className="loading-box">
                  Načítavam závady...
                </div>

              ) : filteredIssues.length ===
                0 ? (

                <div className="empty-box">
                  V tejto kategórii
                  momentálne nie sú
                  žiadne závady.
                </div>

              ) : (

                filteredIssues.map(
                  (issue) => (

                    <button
                      className="issue-card-new"
                      key={issue.id}
                      onClick={() =>
                        openIssue(issue)
                      }
                    >

                      <div className="issue-main">

                        <div className="issue-top">

                          <strong>
                            #
                            {String(
                              issue.id
                            ).padStart(
                              4,
                              "0"
                            )}
                          </strong>

                          <span>
                            {formatDate(
                              issue.created_at
                            )}
                          </span>

                        </div>

                        <h3>
                          {
                            issue.description
                          }
                        </h3>

                        <p>
                          📍{" "}
                          {issue.location}
                        </p>

                        <div className="issue-reporter">
                          Nahlásil:{" "}
                          <strong>
                            {
                              issue.reporter_name
                            }
                          </strong>
                        </div>

                      </div>

                      {issue.photo_key ? (

                        <img
                          src={
                            issue.photo_key
                          }
                          alt="Fotografia závady"
                          className="issue-photo"
                        />

                      ) : (

                        <div className="issue-no-photo">

                          <span>
                            📷
                          </span>

                          <small>
                            bez fotky
                          </small>

                        </div>

                      )}

                      <div className="issue-arrow">
                        ›
                      </div>

                    </button>

                  )
                )

              )}

            </div>

          </div>

          <div className="maintenance-bottom-menu">

            <button className="bottom-menu-active">
              <span>🔧</span>
              Závady
            </button>

            <button>
              <span>📋</span>
              História
            </button>

          </div>

        </section>

      </main>
    );
  }

  /* ========================================================
     LOGIN ÚDRŽBÁRA
     ======================================================== */

  if (
    screen === "maintenance-login"
  ) {
    return (
      <main className="app-shell">

        <section className="app-card login-card">

          <div className="top-bar">

            <button
              className="back-button"
              onClick={() =>
                setScreen("home")
              }
            >
              ← Späť
            </button>

            <img
              src={tatralandiaLogo}
              alt="Tatralandia"
              className="small-logo"
            />

          </div>

          <div className="login-icon-big">
            🔧
          </div>

          <div className="section-badge">
            ÚDRŽBA
          </div>

          <h1>
            Prihlásenie údržbára
          </h1>

          <p className="subtitle">
            Zadajte svoje meno a
            spoločné heslo údržby.
          </p>

          <form
            className="report-form"
            onSubmit={
              loginMaintenance
            }
          >

            <label>
              Vaše meno

              <input
                type="text"
                placeholder="Napr. Jano, Peter, Fero..."
                value={
                  maintenanceName
                }
                onChange={(e) =>
                  setMaintenanceName(
                    e.target.value
                  )
                }
              />

            </label>

            <label>
              Heslo údržby

              <input
                className="password-input"
                type="password"
                placeholder="Zadajte heslo"
                value={
                  maintenancePassword
                }
                onChange={(e) =>
                  setMaintenancePassword(
                    e.target.value
                  )
                }
              />

            </label>

            <button
              className="submit-button"
              type="submit"
            >
              🔧 Prihlásiť sa
            </button>

          </form>

          <div className="test-password">
            Testovacie heslo:{" "}
            <strong>
              test1234
            </strong>
          </div>

        </section>

      </main>
    );
  }

  /* ========================================================
     FORMULÁR ZÁVADY
     ======================================================== */

  if (screen === "report") {
    return (
      <main className="app-shell">

        <section className="app-card">

          <div className="top-bar">

            <button
              className="back-button"
              onClick={() =>
                setScreen("home")
              }
            >
              ← Späť
            </button>

            <img
              src={tatralandiaLogo}
              alt="Tatralandia"
              className="small-logo"
            />

          </div>

          <div className="section-badge">
            HLÁSENIE ZÁVADY
          </div>

          <h1>
            Nahlásiť závadu
          </h1>

          <p className="subtitle">
            Vyplňte základné
            informácie. Hlásenie bude
            odoslané priamo údržbe.
          </p>

          <form
            className="report-form"
            onSubmit={submitReport}
          >

            <label>
              Kto nahlasuje?

              <input
                type="text"
                placeholder="Napíšte svoje meno"
                value={reporter}
                onChange={(e) =>
                  setReporter(
                    e.target.value
                  )
                }
              />

            </label>

            <label>
              Kde sa závada nachádza?

              <input
                type="text"
                placeholder="Napr. Hala Tropic – sprchy"
                value={location}
                onChange={(e) =>
                  setLocation(
                    e.target.value
                  )
                }
              />

            </label>

            <label>
              Popis závady

              <textarea
                placeholder="Popíšte, čo nefunguje alebo čo je poškodené..."
                value={description}
                onChange={(e) =>
                  setDescription(
                    e.target.value
                  )
                }
                rows={5}
              />

            </label>

            <label className="photo-upload">

              <div className="photo-icon">
                📷
              </div>

              <div>
                <strong>
                  Pridať fotografiu
                </strong>

                <span>
                  Odfotiť závadu alebo
                  vybrať fotografiu
                </span>
              </div>

              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) =>
                  setPhotoName(
                    e.target.files?.[0]
                      ?.name || ""
                  )
                }
              />

            </label>

            {photoName && (
              <div className="photo-selected">
                ✓ Fotografia vybraná:{" "}
                {photoName}
              </div>
            )}

            <button
              className="submit-button"
              type="submit"
            >
              ⚠️ Odoslať závadu
            </button>

          </form>

        </section>

      </main>
    );
  }

  /* ========================================================
     POĎAKOVANIE
     ======================================================== */

  if (screen === "success") {
    return (
      <main className="app-shell">

        <section className="app-card success-card">

          <img
            src={tatralandiaLogo}
            alt="Tatralandia"
            className="success-logo"
          />

          <div className="success-icon">
            ✓
          </div>

          <h1>Ďakujeme</h1>

          <p>
            Závada bola úspešne
            nahlásená a odoslaná
            údržbe na riešenie.
          </p>

          <button
            className="submit-button"
            onClick={resetReport}
          >
            Späť na úvod
          </button>

        </section>

      </main>
    );
  }

  /* ========================================================
     DOMOV
     ======================================================== */

  return (
    <main className="app-shell home-shell">

      <section className="app-card home-card">

        <div className="brand-area">

          <img
            src={tatralandiaLogo}
            alt="Tatralandia"
            className="tatralandia-logo"
          />

          <div className="brand-description">
            INTERNÝ SYSTÉM ÚDRŽBY
          </div>

        </div>

        <button
          className="report-button"
          onClick={() =>
            setScreen("report")
          }
        >

          <div className="report-button-icon">
            ⚠️
          </div>

          <div className="report-button-content">

            <strong>
              Nahlásiť závadu
            </strong>

            <span>
              Odoslať nové hlásenie
              údržbe
            </span>

          </div>

          <div className="arrow">
            ›
          </div>

        </button>

        <div className="employee-login-title">
          PRÍSTUP PRE PRACOVNÍKOV
        </div>

        <div className="role-buttons">

          <button
            className="role-button"
            onClick={() =>
              setScreen(
                "maintenance-login"
              )
            }
          >

            <div className="role-icon">
              🔧
            </div>

            <div>
              <strong>
                Údržbár
              </strong>

              <span>
                Nové a rozpracované
                závady
              </span>
            </div>

            <div className="role-arrow">
              ›
            </div>

          </button>

          <button
            className="role-button"
            onClick={() =>
              alert(
                "Vedúceho údržby vytvoríme následne."
              )
            }
          >

            <div className="role-icon">
              🛠️
            </div>

            <div>
              <strong>
                Vedúci údržby
              </strong>

              <span>
                Riadenie úloh a
                štatistika
              </span>
            </div>

            <div className="role-arrow">
              ›
            </div>

          </button>

          <button
            className="role-button"
            onClick={() =>
              alert(
                "Prevádzkového manažéra vytvoríme následne."
              )
            }
          >

            <div className="role-icon">
              📊
            </div>

            <div>
              <strong>
                Prevádzkový manažér
              </strong>

              <span>
                Kompletný prehľad a
                riadenie
              </span>
            </div>

            <div className="role-arrow">
              ›
            </div>

          </button>

        </div>

        <div className="footer-line">
          Tatralandia • interný systém
          hlásenia závad
        </div>

      </section>

    </main>
  );
}

export default App;
