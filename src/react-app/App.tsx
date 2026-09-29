import { useState } from "react";
import tatralandiaLogo from "./assets/tatralandia-logo.jpg";
import "./App.css";

type Screen =
  | "home"
  | "report"
  | "success"
  | "maintenance-login"
  | "maintenance-dashboard";

function App() {
  const [screen, setScreen] = useState<Screen>("home");

  // Hlásenie závady
  const [reporter, setReporter] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photoName, setPhotoName] = useState("");

  // Údržbár
  const [maintenanceName, setMaintenanceName] = useState("");
  const [maintenancePassword, setMaintenancePassword] = useState("");
  const [loggedMaintenanceName, setLoggedMaintenanceName] = useState("");
const [maintenanceFilter, setMaintenanceFilter] = useState<
  "new" | "progress" | "material" | "manager"
>("new");
  const submitReport = (e: React.FormEvent) => {
    e.preventDefault();

    if (!reporter.trim() || !location.trim() || !description.trim()) {
      alert("Prosím, vyplňte meno, miesto a popis závady.");
      return;
    }

    setScreen("success");
  };

  const resetReport = () => {
    setReporter("");
    setLocation("");
    setDescription("");
    setPhotoName("");
    setScreen("home");
  };

  const loginMaintenance = (e: React.FormEvent) => {
    e.preventDefault();

    if (!maintenanceName.trim()) {
      alert("Napíšte svoje meno.");
      return;
    }

    // IBA DOČASNÉ TESTOVACIE HESLO
    if (maintenancePassword !== "test1234") {
      alert("Nesprávne heslo.");
      return;
    }

    setLoggedMaintenanceName(maintenanceName.trim());
    setScreen("maintenance-dashboard");
  };

  const logoutMaintenance = () => {
    setMaintenancePassword("");
    setMaintenanceName("");
    setLoggedMaintenanceName("");
    setScreen("home");
  };
const maintenanceIssues = [
  {
    id: "0001",
    status: "new",
    time: "pred 8 min.",
    title: "Tečie voda pri sprche",
    location: "Hala Tropic – pánske sprchy",
    reporter: "Peter",
    photo: null,
  },
  {
    id: "0002",
    status: "new",
    time: "pred 21 min.",
    title: "Nesvieti osvetlenie",
    location: "Chodba pri šatniach",
    reporter: "Janka",
    photo: null,
  },
  {
    id: "0003",
    status: "new",
    time: "pred 34 min.",
    title: "Uvoľnené zábradlie",
    location: "Vonkajší bazén",
    reporter: "Martin",
    photo: null,
  },
  {
    id: "0004",
    status: "progress",
    time: "dnes 09:02",
    title: "Pokazený zámok na dverách",
    location: "Technická chodba",
    reporter: "Marek",
    photo: null,
  },
  {
    id: "0005",
    status: "progress",
    time: "dnes 08:45",
    title: "Kvapká ventil",
    location: "Strojovňa",
    reporter: "Peter",
    photo: null,
  },
  {
    id: "0006",
    status: "progress",
    time: "dnes 08:15",
    title: "Poškodená lavička",
    location: "Šatne",
    reporter: "Lucia",
    photo: null,
  },
  {
    id: "0007",
    status: "progress",
    time: "včera 18:40",
    title: "Kontrola čerpadla",
    location: "Technologická miestnosť",
    reporter: "Ján",
    photo: null,
  },
  {
    id: "0008",
    status: "material",
    time: "včera 15:20",
    title: "Výmena poškodeného ventilu",
    location: "Hala Tropic",
    reporter: "Milan",
    photo: null,
  },
  {
    id: "0009",
    status: "material",
    time: "včera 14:10",
    title: "Oprava madla",
    location: "Schodisko",
    reporter: "Peter",
    photo: null,
  },
  {
    id: "0010",
    status: "manager",
    time: "včera 11:30",
    title: "Porucha technologického zariadenia",
    location: "Strojovňa",
    reporter: "Jaro",
    photo: null,
  },
];

const filteredIssues = maintenanceIssues.filter(
  (issue) => issue.status === maintenanceFilter
);

const filterTitle = {
  new: "Nové závady",
  progress: "Rozpracované",
  material: "Čaká na materiál",
  manager: "Posunuté vedúcemu",
}[maintenanceFilter];
  // ============================
  // ÚDRŽBÁR - DASHBOARD
  // ============================

  if (screen === "maintenance-dashboard") {
    return (
      <main className="app-shell">
        <section className="app-card dashboard-card">
          <div className="dashboard-header">
            <img
              src={tatralandiaLogo}
              alt="Tatralandia"
              className="dashboard-logo"
            />

            <button className="logout-button" onClick={logoutMaintenance}>
              Odhlásiť
            </button>
          </div>

          <div className="welcome-block">
            <div>
              <span>PRIHLÁSENÝ ÚDRŽBÁR</span>
              <h2>{loggedMaintenanceName}</h2>
            </div>

            <div className="worker-avatar">🔧</div>
          </div>

          <div className="dashboard-title-row">
            <div>
              <div className="section-label">PREHĽAD ÚDRŽBY</div>
              <h1>Závady</h1>
            </div>

            <div className="notification-bell">
              🔔
              <span>3</span>
            </div>
          </div>

          <div className="stats-grid">
  <button
    className={`stat-card ${maintenanceFilter === "new" ? "stat-active" : ""}`}
    onClick={() => setMaintenanceFilter("new")}
  >
    <span className="stat-number">3</span>
    <span className="stat-title">Nové závady</span>
    <small>Čakajú na prevzatie</small>
  </button>

  <button
    className={`stat-card ${maintenanceFilter === "progress" ? "stat-active" : ""}`}
    onClick={() => setMaintenanceFilter("progress")}
  >
    <span className="stat-number">4</span>
    <span className="stat-title">Rozpracované</span>
    <small>Aktuálne riešené</small>
  </button>

  <button
    className={`stat-card ${maintenanceFilter === "material" ? "stat-active" : ""}`}
    onClick={() => setMaintenanceFilter("material")}
  >
    <span className="stat-number">2</span>
    <span className="stat-title">Čaká na materiál</span>
    <small>Potrebná súčinnosť</small>
  </button>

  <button
    className={`stat-card ${maintenanceFilter === "manager" ? "stat-active" : ""}`}
    onClick={() => setMaintenanceFilter("manager")}
  >
    <span className="stat-number">1</span>
    <span className="stat-title">U vedúceho</span>
    <small>Posunuté ďalej</small>
  </button>
</div>
          <div className="dashboard-section">
  <div className="dashboard-section-heading">
    <strong>{filterTitle}</strong>
    <span>{filteredIssues.length} položiek</span>
  </div>

  <div className="issue-list">
    {filteredIssues.map((issue) => (
      <button className="issue-card-new" key={issue.id}>
        <div className="issue-main">
          <div className="issue-top">
            <strong>#{issue.id}</strong>
            <span>{issue.time}</span>
          </div>

          <h3>{issue.title}</h3>

          <p>📍 {issue.location}</p>

          <div className="issue-reporter">
            Nahlásil: <strong>{issue.reporter}</strong>
          </div>
        </div>

        {issue.photo ? (
          <img
            src={issue.photo}
            alt="Fotografia závady"
            className="issue-photo"
          />
        ) : (
          <div className="issue-no-photo">
            <span>📷</span>
            <small>bez fotky</small>
          </div>
        )}

        <div className="issue-arrow">›</div>
      </button>
    ))}
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

  // ============================
  // ÚDRŽBÁR - PRIHLÁSENIE
  // ============================

  if (screen === "maintenance-login") {
    return (
      <main className="app-shell">
        <section className="app-card login-card">
          <div className="top-bar">
            <button className="back-button" onClick={() => setScreen("home")}>
              ← Späť
            </button>

            <img
              src={tatralandiaLogo}
              alt="Tatralandia"
              className="small-logo"
            />
          </div>

          <div className="login-icon-big">🔧</div>

          <div className="section-badge">ÚDRŽBA</div>

          <h1>Prihlásenie údržbára</h1>

          <p className="subtitle">
            Zadajte svoje meno a spoločné heslo údržby.
          </p>

          <form className="report-form" onSubmit={loginMaintenance}>
            <label>
              Vaše meno
              <input
                type="text"
                placeholder="Napr. Jano, Peter, Fero..."
                value={maintenanceName}
                onChange={(e) => setMaintenanceName(e.target.value)}
              />
            </label>

            <label>
              Heslo údržby
              <input
                className="password-input"
                type="password"
                placeholder="Zadajte heslo"
                value={maintenancePassword}
                onChange={(e) => setMaintenancePassword(e.target.value)}
              />
            </label>

            <button className="submit-button" type="submit">
              🔧 Prihlásiť sa
            </button>
          </form>

          <div className="test-password">
            Testovacie heslo: <strong>test1234</strong>
          </div>
        </section>
      </main>
    );
  }

  // ============================
  // NAHLÁSENIE ZÁVADY
  // ============================

  if (screen === "report") {
    return (
      <main className="app-shell">
        <section className="app-card">
          <div className="top-bar">
            <button className="back-button" onClick={() => setScreen("home")}>
              ← Späť
            </button>

            <img
              src={tatralandiaLogo}
              alt="Tatralandia"
              className="small-logo"
            />
          </div>

          <div className="section-badge">HLÁSENIE ZÁVADY</div>

          <h1>Nahlásiť závadu</h1>

          <p className="subtitle">
            Vyplňte základné informácie. Hlásenie bude odoslané priamo údržbe.
          </p>

          <form className="report-form" onSubmit={submitReport}>
            <label>
              Kto nahlasuje?
              <input
                type="text"
                placeholder="Napíšte svoje meno"
                value={reporter}
                onChange={(e) => setReporter(e.target.value)}
              />
            </label>

            <label>
              Kde sa závada nachádza?
              <input
                type="text"
                placeholder="Napr. Hala Tropic – sprchy"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>

            <label>
              Popis závady
              <textarea
                placeholder="Popíšte, čo nefunguje alebo čo je poškodené..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
              />
            </label>

            <label className="photo-upload">
              <div className="photo-icon">📷</div>

              <div>
                <strong>Pridať fotografiu</strong>
                <span>Odfotiť závadu alebo vybrať fotografiu</span>
              </div>

              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) =>
                  setPhotoName(e.target.files?.[0]?.name || "")
                }
              />
            </label>

            {photoName && (
              <div className="photo-selected">
                ✓ Fotografia vybraná: {photoName}
              </div>
            )}

            <button className="submit-button" type="submit">
              ⚠️ Odoslať závadu
            </button>
          </form>
        </section>
      </main>
    );
  }

  // ============================
  // POTVRDENIE
  // ============================

  if (screen === "success") {
    return (
      <main className="app-shell">
        <section className="app-card success-card">
          <img
            src={tatralandiaLogo}
            alt="Tatralandia"
            className="success-logo"
          />

          <div className="success-icon">✓</div>

          <h1>Ďakujeme</h1>

          <p>
            Závada bola úspešne nahlásená a odoslaná údržbe na riešenie.
          </p>

          <button className="submit-button" onClick={resetReport}>
            Späť na úvod
          </button>
        </section>
      </main>
    );
  }

  // ============================
  // DOMOV
  // ============================

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
          onClick={() => setScreen("report")}
        >
          <div className="report-button-icon">⚠️</div>

          <div className="report-button-content">
            <strong>Nahlásiť závadu</strong>
            <span>Odoslať nové hlásenie údržbe</span>
          </div>

          <div className="arrow">›</div>
        </button>

        <div className="employee-login-title">
          PRÍSTUP PRE PRACOVNÍKOV
        </div>

        <div className="role-buttons">
          <button
            className="role-button"
            onClick={() => setScreen("maintenance-login")}
          >
            <div className="role-icon">🔧</div>

            <div>
              <strong>Údržbár</strong>
              <span>Nové a rozpracované závady</span>
            </div>

            <div className="role-arrow">›</div>
          </button>

          <button
            className="role-button"
            onClick={() =>
              alert("Vedúceho údržby vytvoríme následne.")
            }
          >
            <div className="role-icon">🛠️</div>

            <div>
              <strong>Vedúci údržby</strong>
              <span>Riadenie úloh a štatistika</span>
            </div>

            <div className="role-arrow">›</div>
          </button>

          <button
            className="role-button"
            onClick={() =>
              alert("Prevádzkového manažéra vytvoríme následne.")
            }
          >
            <div className="role-icon">📊</div>

            <div>
              <strong>Prevádzkový manažér</strong>
              <span>Kompletný prehľad a riadenie</span>
            </div>

            <div className="role-arrow">›</div>
          </button>
        </div>

        <div className="footer-line">
          Tatralandia • interný systém hlásenia závad
        </div>
      </section>
    </main>
  );
}

export default App;
