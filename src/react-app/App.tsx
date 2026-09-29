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

type ModalType =
  | "success"
  | "error"
  | "info";

type ModalState = {
  visible: boolean;
  type: ModalType;
  title: string;
  message: string;
  detail?: string;
};

function App() {
  const [screen, setScreen] =
    useState<Screen>("home");

  /* ============================
     MODAL
     ============================ */

  const [modal, setModal] =
    useState<ModalState>({
      visible: false,
      type: "info",
      title: "",
      message: "",
      detail: "",
    });

  const showModal = (
    type: ModalType,
    title: string,
    message: string,
    detail?: string
  ) => {
    setModal({
      visible: true,
      type,
      title,
      message,
      detail,
    });
  };

  const closeModal = () => {
    setModal((prev) => ({
      ...prev,
      visible: false,
    }));
  };

  /* ============================
     NAHLÁSENIE
     ============================ */

  const [reporter, setReporter] =
    useState("");

  const [location, setLocation] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [photoFile, setPhotoFile] =
    useState<File | null>(null);

  const [photoName, setPhotoName] =
    useState("");

  const [reportLoading, setReportLoading] =
    useState(false);

  /* ============================
     ÚDRŽBA
     ============================ */

  const [
    maintenanceName,
    setMaintenanceName,
  ] = useState("");

  const [
    maintenancePassword,
    setMaintenancePassword,
  ] = useState("");

  const [
    loggedMaintenanceName,
    setLoggedMaintenanceName,
  ] = useState("");

  const [
    maintenanceFilter,
    setMaintenanceFilter,
  ] =
    useState<MaintenanceFilter>(
      "new"
    );

  const [issues, setIssues] =
    useState<Issue[]>([]);

  const [
    issuesLoading,
    setIssuesLoading,
  ] = useState(false);

  const [
    selectedIssue,
    setSelectedIssue,
  ] =
    useState<Issue | null>(null);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  /* ============================
     PHOTO URL
     ============================ */

  const getPhotoUrl = (
    key: string | null
  ) => {
    if (!key) return "";

    return `/api/photo?key=${encodeURIComponent(
      key
    )}`;
  };

  /* ============================
     NAČÍTANIE ZÁVAD
     ============================ */

  const loadIssues = async () => {
    try {
      setIssuesLoading(true);

      const response =
        await fetch("/api/issues");

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        showModal(
          "error",
          "Nepodarilo sa načítať závady",
          data.error ||
            "Skúste aplikáciu načítať znova."
        );

        return;
      }

      setIssues(
        data.issues || []
      );
    } catch (error) {
      console.error(error);

      showModal(
        "error",
        "Chyba spojenia",
        "Nepodarilo sa spojiť so serverom."
      );
    } finally {
      setIssuesLoading(false);
    }
  };

  /* ============================
     ODOSLANIE ZÁVADY
     ============================ */

  const submitReport = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (
      !reporter.trim() ||
      !location.trim() ||
      !description.trim()
    ) {
      showModal(
        "error",
        "Chýbajú údaje",
        "Vyplňte meno, miesto a popis závady."
      );

      return;
    }

    try {
      setReportLoading(true);

      const formData =
        new FormData();

      formData.append(
        "reporter_name",
        reporter.trim()
      );

      formData.append(
        "location",
        location.trim()
      );

      formData.append(
        "description",
        description.trim()
      );

      if (photoFile) {
        formData.append(
          "photo",
          photoFile,
          photoFile.name
        );
      }

      const response =
        await fetch(
          "/api/issues",
          {
            method: "POST",
            body: formData,
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        showModal(
          "error",
          "Závadu sa nepodarilo odoslať",
          data.error ||
            "Skúste to znova."
        );

        return;
      }

      setScreen("success");
    } catch (error) {
      console.error(error);

      showModal(
        "error",
        "Chyba spojenia",
        "Nepodarilo sa spojiť so serverom."
      );
    } finally {
      setReportLoading(false);
    }
  };

  const resetReport = () => {
    setReporter("");
    setLocation("");
    setDescription("");
    setPhotoFile(null);
    setPhotoName("");
    setScreen("home");
  };

  /* ============================
     LOGIN
     ============================ */

  const loginMaintenance =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      if (
        !maintenanceName.trim()
      ) {
        showModal(
          "error",
          "Chýba meno",
          "Pred prihlásením napíšte svoje meno."
        );

        return;
      }

      if (
        maintenancePassword !==
        "test1234"
      ) {
        showModal(
          "error",
          "Nesprávne heslo",
          "Zadané heslo údržby nie je správne."
        );

        return;
      }

      setLoggedMaintenanceName(
        maintenanceName.trim()
      );

      await loadIssues();

      setMaintenanceFilter(
        "new"
      );

      setScreen(
        "maintenance-dashboard"
      );
    };

  const logoutMaintenance =
    () => {
      setMaintenancePassword("");
      setMaintenanceName("");
      setLoggedMaintenanceName("");
      setIssues([]);
      setSelectedIssue(null);
      setMaintenanceFilter("new");
      setScreen("home");
    };

  /* ============================
     DETAIL
     ============================ */

  const openIssue = (
    issue: Issue
  ) => {
    setSelectedIssue(issue);

    setScreen(
      "maintenance-issue"
    );
  };

  const takeIssue = async () => {
    if (!selectedIssue) return;

    try {
      setActionLoading(true);

      const response =
        await fetch(
          `/api/issues/${selectedIssue.id}/take`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              worker_name:
                loggedMaintenanceName,
            }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        showModal(
          "error",
          "Závadu sa nepodarilo prevziať",
          data.error ||
            "Skúste obnoviť zoznam závad."
        );

        await loadIssues();

        return;
      }

      setSelectedIssue(
        data.issue
      );

      await loadIssues();

      showModal(
        "success",
        "Závada bola prevzatá",
        `Závada #${String(
          selectedIssue.id
        ).padStart(
          4,
          "0"
        )} je teraz v riešení.`,
        `Prevzal: ${loggedMaintenanceName}`
      );
    } catch (error) {
      console.error(error);

      showModal(
        "error",
        "Nastala chyba",
        "Pri preberaní závady sa nepodarilo spojiť so serverom."
      );
    } finally {
      setActionLoading(false);
    }
  };

  /* ============================
     FILTRE
     ============================ */

  const filteredIssues =
    issues.filter(
      (issue) =>
        issue.status ===
        maintenanceFilter
    );

  const newCount =
    issues.filter(
      (issue) =>
        issue.status === "new"
    ).length;

  const progressCount =
    issues.filter(
      (issue) =>
        issue.status ===
        "progress"
    ).length;

  const materialCount =
    issues.filter(
      (issue) =>
        issue.status ===
        "material"
    ).length;

  const managerCount =
    issues.filter(
      (issue) =>
        issue.status ===
        "manager"
    ).length;

  const filterTitle: Record<
    MaintenanceFilter,
    string
  > = {
    new: "Nové závady",
    progress:
      "Rozpracované",
    material:
      "Čaká na materiál",
    manager:
      "Posunuté vedúcemu",
  };

  /* ============================
     DÁTUM
     ============================ */

  const formatDate = (
    dateValue: string
  ) => {
    if (!dateValue) return "";

    let normalized =
      dateValue;

    if (
      !normalized.includes("T")
    ) {
      normalized =
        normalized.replace(
          " ",
          "T"
        );
    }

    if (
      !normalized.endsWith(
        "Z"
      ) &&
      !normalized.includes("+")
    ) {
      normalized += "Z";
    }

    const date =
      new Date(normalized);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return dateValue;
    }

    return date.toLocaleString(
      "sk-SK",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };

  const statusLabel = (
    status: string
  ) => {
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

  /* ============================
     MODAL
     ============================ */

  const modalWindow =
    modal.visible ? (
      <div
        className="custom-modal-overlay"
        onClick={closeModal}
      >
        <div
          className="custom-modal"
          onClick={(e) =>
            e.stopPropagation()
          }
        >
          <div
            className={`custom-modal-icon modal-${modal.type}`}
          >
            {modal.type ===
            "success"
              ? "✓"
              : modal.type ===
                "error"
              ? "!"
              : "i"}
          </div>

          <div className="custom-modal-brand">
            TATRALANDIA • ÚDRŽBA
          </div>

          <h2>{modal.title}</h2>

          <p>{modal.message}</p>

          {modal.detail && (
            <div className="custom-modal-detail">
              {modal.detail}
            </div>
          )}

          <button
            className={`custom-modal-button button-${modal.type}`}
            onClick={closeModal}
          >
            Pokračovať
          </button>
        </div>
      </div>
    ) : null;

  /* ============================
     DETAIL ZÁVADY
     ============================ */

  if (
    screen ===
      "maintenance-issue" &&
    selectedIssue
  ) {
    return (
      <>
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
                src={
                  tatralandiaLogo
                }
                alt="Tatralandia"
                className="small-logo"
              />
            </div>

            <div className="issue-detail-number">
              ZÁVADA #
              {String(
                selectedIssue.id
              ).padStart(
                4,
                "0"
              )}
            </div>

            <div
              className={`issue-detail-status status-${selectedIssue.status}`}
            >
              {statusLabel(
                selectedIssue.status
              )}
            </div>

            <h1 className="issue-detail-title">
              {
                selectedIssue.description
              }
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
                    {
                      selectedIssue.location
                    }
                  </strong>
                </div>
              </div>

              <div className="detail-row">
                <span className="detail-icon">
                  👤
                </span>

                <div>
                  <small>
                    NAHLÁSIL
                  </small>

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
              <small>
                POPIS ZÁVADY
              </small>

              <p>
                {
                  selectedIssue.description
                }
              </p>
            </div>

            {selectedIssue.photo_key ? (
              <img
                src={getPhotoUrl(
                  selectedIssue.photo_key
                )}
                alt="Fotografia závady"
                className="detail-photo"
              />
            ) : (
              <div className="detail-photo-placeholder">
                <span>📷</span>

                <strong>
                  Fotografia nebola
                  priložená
                </strong>
              </div>
            )}

            {selectedIssue.status ===
              "new" && (
              <button
                className="take-issue-button"
                onClick={takeIssue}
                disabled={
                  actionLoading
                }
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

        {modalWindow}
      </>
    );
  }

  /* ============================
     DASHBOARD
     ============================ */

  if (
    screen ===
    "maintenance-dashboard"
  ) {
    return (
      <>
        <main className="app-shell">
          <section className="app-card dashboard-card">
            <div className="dashboard-header">
              <img
                src={
                  tatralandiaLogo
                }
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

                <h1>
                  Závady
                </h1>
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

                {newCount >
                  0 && (
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
                        key={
                          issue.id
                        }
                        onClick={() =>
                          openIssue(
                            issue
                          )
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
                            {
                              issue.location
                            }
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
                            src={getPhotoUrl(
                              issue.photo_key
                            )}
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
                <span>
                  🔧
                </span>
                Závady
              </button>

              <button>
                <span>
                  📋
                </span>
                História
              </button>
            </div>
          </section>
        </main>

        {modalWindow}
      </>
    );
  }

  /* ============================
     LOGIN
     ============================ */

  if (
    screen ===
    "maintenance-login"
  ) {
    return (
      <>
        <main className="app-shell">
          <section className="app-card login-card">
            <div className="top-bar">
              <button
                className="back-button"
                onClick={() =>
                  setScreen(
                    "home"
                  )
                }
              >
                ← Späť
              </button>

              <img
                src={
                  tatralandiaLogo
                }
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
                      e.target
                        .value
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
                      e.target
                        .value
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

        {modalWindow}
      </>
    );
  }

  /* ============================
     FORMULÁR
     ============================ */

  if (screen === "report") {
    return (
      <>
        <main className="app-shell">
          <section className="app-card">
            <div className="top-bar">
              <button
                className="back-button"
                onClick={() =>
                  setScreen(
                    "home"
                  )
                }
              >
                ← Späť
              </button>

              <img
                src={
                  tatralandiaLogo
                }
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
              informácie. Hlásenie
              bude odoslané priamo
              údržbe.
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
                  value={
                    reporter
                  }
                  onChange={(e) =>
                    setReporter(
                      e.target
                        .value
                    )
                  }
                />
              </label>

              <label>
                Kde sa závada
                nachádza?

                <input
                  type="text"
                  placeholder="Napr. Hala Tropic – sprchy"
                  value={
                    location
                  }
                  onChange={(e) =>
                    setLocation(
                      e.target
                        .value
                    )
                  }
                />
              </label>

              <label>
                Popis závady

                <textarea
                  placeholder="Popíšte, čo nefunguje alebo čo je poškodené..."
                  value={
                    description
                  }
                  onChange={(e) =>
                    setDescription(
                      e.target
                        .value
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
                    Pridať
                    fotografiu
                  </strong>

                  <span>
                    Odfotiť závadu
                    alebo vybrať
                    fotografiu
                  </span>
                </div>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file =
                      e.target
                        .files?.[0] ||
                      null;

                    setPhotoFile(
                      file
                    );

                    setPhotoName(
                      file?.name ||
                        ""
                    );
                  }}
                />
              </label>

              {photoName && (
                <div className="photo-selected">
                  ✓ Fotografia
                  vybraná:{" "}
                  {photoName}
                </div>
              )}

              <button
                className="submit-button"
                type="submit"
                disabled={
                  reportLoading
                }
              >
                {reportLoading
                  ? "Odosielam..."
                  : "⚠️ Odoslať závadu"}
              </button>
            </form>
          </section>
        </main>

        {modalWindow}
      </>
    );
  }

  /* ============================
     SUCCESS
     ============================ */

  if (
    screen === "success"
  ) {
    return (
      <main className="app-shell">
        <section className="app-card success-card">
          <img
            src={
              tatralandiaLogo
            }
            alt="Tatralandia"
            className="success-logo"
          />

          <div className="success-icon">
            ✓
          </div>

          <h1>
            Ďakujeme
          </h1>

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

  /* ============================
     HOME
     ============================ */

  return (
    <>
      <main className="app-shell home-shell">
        <section className="app-card home-card">
          <div className="brand-area">
            <img
              src={
                tatralandiaLogo
              }
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
              setScreen(
                "report"
              )
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
                Odoslať nové
                hlásenie údržbe
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
                  Nové a
                  rozpracované
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
                showModal(
                  "info",
                  "Vedúci údržby",
                  "Túto časť aplikácie vytvoríme v ďalšom kroku."
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
                  Riadenie úloh
                  a štatistika
                </span>
              </div>

              <div className="role-arrow">
                ›
              </div>
            </button>

            <button
              className="role-button"
              onClick={() =>
                showModal(
                  "info",
                  "Prevádzkový manažér",
                  "Túto časť aplikácie vytvoríme neskôr."
                )
              }
            >
              <div className="role-icon">
                📊
              </div>

              <div>
                <strong>
                  Prevádzkový
                  manažér
                </strong>

                <span>
                  Kompletný prehľad
                  a riadenie
                </span>
              </div>

              <div className="role-arrow">
                ›
              </div>
            </button>
          </div>

          <div className="footer-line">
            Tatralandia • interný
            systém hlásenia závad
          </div>
        </section>
      </main>

      {modalWindow}
    </>
  );
}

export default App;
