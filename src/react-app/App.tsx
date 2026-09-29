import { useState } from "react";
import tatralandiaLogo from "./assets/tatralandia-logo.jpg";
import "./App.css";

type Screen =
  | "home"
  | "report"
  | "success"
  | "maintenance-login"
  | "maintenance-dashboard"
  | "maintenance-issue"
  | "maintenance-history"
  | "maintenance-history-detail"
  | "manager-login"
  | "manager-dashboard"
  | "manager-issue"
  | "manager-history"
  | "manager-history-detail";

type MaintenanceFilter =
  | "new"
  | "progress"
  | "material"
  | "manager";

type ManagerFilter =
  | "material"
  | "manager"
  | "operations"
  | "closed";

type MaintenanceActionMode =
  | "resolve"
  | "material"
  | "manager"
  | null;

type ManagerActionMode =
  | "return"
  | "close"
  | "operations"
  | null;

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

type IssueEvent = {
  id: number;
  issue_id: number;
  event_type: string;
  actor_role: string | null;
  actor_name: string | null;
  message: string | null;
  photo_key: string | null;
  created_at: string;
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

  /* =========================================================
     MODAL
     ========================================================= */

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

  /* =========================================================
     REPORTER
     ========================================================= */

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

  const [
    reportLoading,
    setReportLoading,
  ] = useState(false);

  /* =========================================================
     SPOLOČNÉ DÁTA
     ========================================================= */

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

  const [issueEvents, setIssueEvents] =
    useState<IssueEvent[]>([]);

  const [
    historyLoading,
    setHistoryLoading,
  ] = useState(false);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  /* =========================================================
     ÚDRŽBÁR LOGIN
     ========================================================= */

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
    useState<MaintenanceFilter>("new");

  /* =========================================================
     VEDÚCI LOGIN
     ========================================================= */

  const [
    managerName,
    setManagerName,
  ] = useState("");

  const [
    managerPassword,
    setManagerPassword,
  ] = useState("");

  const [
    loggedManagerName,
    setLoggedManagerName,
  ] = useState("");

  const [
    managerFilter,
    setManagerFilter,
  ] =
    useState<ManagerFilter>("manager");

  /* =========================================================
     AKCIE ÚDRŽBÁRA
     ========================================================= */

  const [
    maintenanceActionMode,
    setMaintenanceActionMode,
  ] =
    useState<MaintenanceActionMode>(null);

  const [
    actionComment,
    setActionComment,
  ] = useState("");

  const [
    actionPhoto,
    setActionPhoto,
  ] = useState<File | null>(null);

  const [
    actionPhotoName,
    setActionPhotoName,
  ] = useState("");

  /* =========================================================
     AKCIE VEDÚCEHO
     ========================================================= */

  const [
    managerActionMode,
    setManagerActionMode,
  ] =
    useState<ManagerActionMode>(null);

  const [
    managerActionComment,
    setManagerActionComment,
  ] = useState("");

  const [
    managerActionPhoto,
    setManagerActionPhoto,
  ] = useState<File | null>(null);

  const [
    managerActionPhotoName,
    setManagerActionPhotoName,
  ] = useState("");

  /* =========================================================
     FOTO
     ========================================================= */

  const getPhotoUrl = (
    key: string | null
  ) => {
    if (!key) return "";

    return `/api/photo?key=${encodeURIComponent(
      key
    )}`;
  };

  /* =========================================================
     NAČÍTANIE ZÁVAD
     ========================================================= */

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

      setIssues(data.issues || []);
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

  /* =========================================================
     HISTÓRIA UDALOSTÍ
     ========================================================= */

  const loadIssueEvents = async (
    issueId: number
  ) => {
    try {
      setHistoryLoading(true);

      const response =
        await fetch(
          `/api/issues/${issueId}/events`
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        showModal(
          "error",
          "Históriu sa nepodarilo načítať",
          data.error ||
            "Skúste to znova."
        );

        return;
      }

      setIssueEvents(
        data.events || []
      );
    } catch (error) {
      console.error(error);

      showModal(
        "error",
        "Chyba spojenia",
        "Nepodarilo sa načítať históriu závady."
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  /* =========================================================
     NAHLÁSENIE ZÁVADY
     ========================================================= */

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
        await fetch("/api/issues", {
          method: "POST",
          body: formData,
        });

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

  /* =========================================================
     LOGIN ÚDRŽBÁRA
     ========================================================= */

  const loginMaintenance =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      if (!maintenanceName.trim()) {
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

      setMaintenanceFilter("new");

      setScreen(
        "maintenance-dashboard"
      );
    };

  const logoutMaintenance = () => {
    setMaintenancePassword("");
    setMaintenanceName("");
    setLoggedMaintenanceName("");
    setSelectedIssue(null);
    setIssueEvents([]);
    setScreen("home");
  };

  /* =========================================================
     LOGIN VEDÚCEHO
     ========================================================= */

  const loginManager =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      if (!managerName.trim()) {
        showModal(
          "error",
          "Chýba meno",
          "Pred prihlásením napíšte svoje meno."
        );

        return;
      }

      if (
        managerPassword !==
        "veduci1234"
      ) {
        showModal(
          "error",
          "Nesprávne heslo",
          "Zadané heslo vedúceho údržby nie je správne."
        );

        return;
      }

      setLoggedManagerName(
        managerName.trim()
      );

      await loadIssues();

      setManagerFilter("manager");

      setScreen(
        "manager-dashboard"
      );
    };

  const logoutManager = () => {
    setManagerName("");
    setManagerPassword("");
    setLoggedManagerName("");
    setSelectedIssue(null);
    setIssueEvents([]);
    setScreen("home");
  };

  /* =========================================================
     PREVZATIE ÚDRŽBÁROM
     ========================================================= */

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
            "Skúste obnoviť zoznam."
        );

        await loadIssues();
        return;
      }

      setSelectedIssue(data.issue);

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
        "Nepodarilo sa spojiť so serverom."
      );
    } finally {
      setActionLoading(false);
    }
  };

  /* =========================================================
     AKCIA ÚDRŽBÁRA
     ========================================================= */

  const openMaintenanceAction = (
    mode: MaintenanceActionMode
  ) => {
    setActionComment("");
    setActionPhoto(null);
    setActionPhotoName("");
    setMaintenanceActionMode(mode);
  };

  const closeMaintenanceAction =
    () => {
      setMaintenanceActionMode(null);
      setActionComment("");
      setActionPhoto(null);
      setActionPhotoName("");
    };

  const submitMaintenanceAction =
    async () => {
      if (
        !selectedIssue ||
        !maintenanceActionMode
      ) {
        return;
      }

      if (!actionComment.trim()) {
        showModal(
          "error",
          "Chýba komentár",
          "Napíšte stručne, čo bolo vykonané alebo čo je potrebné."
        );

        return;
      }

      let targetStatus = "";

      if (
        maintenanceActionMode ===
        "resolve"
      ) {
        targetStatus = "closed";
      }

      if (
        maintenanceActionMode ===
        "material"
      ) {
        targetStatus = "material";
      }

      if (
        maintenanceActionMode ===
        "manager"
      ) {
        targetStatus = "manager";
      }

      try {
        setActionLoading(true);

        const formData =
          new FormData();

        formData.append(
          "worker_name",
          loggedMaintenanceName
        );

        formData.append(
          "status",
          targetStatus
        );

        formData.append(
          "message",
          actionComment.trim()
        );

        if (actionPhoto) {
          formData.append(
            "photo",
            actionPhoto,
            actionPhoto.name
          );
        }

        const response =
          await fetch(
            `/api/issues/${selectedIssue.id}/status`,
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
            "Akciu sa nepodarilo uložiť",
            data.error ||
              "Skúste to znova."
          );

          return;
        }

        setSelectedIssue(data.issue);

        await loadIssues();

        closeMaintenanceAction();

        if (
          targetStatus === "closed"
        ) {
          showModal(
            "success",
            "Závada bola vyriešená",
            "Závada bola úspešne uzavretá.",
            actionPhoto
              ? "Fotografia po oprave bola uložená."
              : `Vyriešil: ${loggedMaintenanceName}`
          );
        }

        if (
          targetStatus === "material"
        ) {
          showModal(
            "success",
            "Čaká na materiál",
            "Požiadavka bola uložená.",
            `Zapísal: ${loggedMaintenanceName}`
          );
        }

        if (
          targetStatus === "manager"
        ) {
          showModal(
            "success",
            "Posunuté vedúcemu",
            "Závada bola odoslaná vedúcemu údržby.",
            `Odoslal: ${loggedMaintenanceName}`
          );
        }
      } catch (error) {
        console.error(error);

        showModal(
          "error",
          "Nastala chyba",
          "Nepodarilo sa spojiť so serverom."
        );
      } finally {
        setActionLoading(false);
      }
    };

  /* =========================================================
     AKCIA VEDÚCEHO
     ========================================================= */

  const openManagerAction = (
    mode: ManagerActionMode
  ) => {
    setManagerActionComment("");
    setManagerActionPhoto(null);
    setManagerActionPhotoName("");
    setManagerActionMode(mode);
  };

  const closeManagerAction = () => {
    setManagerActionMode(null);
    setManagerActionComment("");
    setManagerActionPhoto(null);
    setManagerActionPhotoName("");
  };

  const submitManagerAction =
    async () => {
      if (
        !selectedIssue ||
        !managerActionMode
      ) {
        return;
      }

      if (
        !managerActionComment.trim()
      ) {
        showModal(
          "error",
          "Chýba komentár",
          "Vedúci musí k akcii pridať krátky komentár."
        );

        return;
      }

      try {
        setActionLoading(true);

        const formData =
          new FormData();

        formData.append(
          "manager_name",
          loggedManagerName
        );

        formData.append(
          "action",
          managerActionMode
        );

        formData.append(
          "message",
          managerActionComment.trim()
        );

        if (managerActionPhoto) {
          formData.append(
            "photo",
            managerActionPhoto,
            managerActionPhoto.name
          );
        }

        const response =
          await fetch(
            `/api/issues/${selectedIssue.id}/manager-action`,
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
            "Akciu sa nepodarilo uložiť",
            data.error ||
              "Skúste to znova."
          );

          return;
        }

        setSelectedIssue(data.issue);

        await loadIssues();

        closeManagerAction();

        if (
          managerActionMode ===
          "return"
        ) {
          showModal(
            "success",
            "Vrátené údržbe",
            "Závada sa znovu objaví medzi novými závadami údržbárov.",
            `Vrátil: ${loggedManagerName}`
          );
        }

        if (
          managerActionMode ===
          "close"
        ) {
          showModal(
            "success",
            "Závada uzavretá",
            "Vedúci údržby závadu uzavrel.",
            `Uzavrel: ${loggedManagerName}`
          );
        }

        if (
          managerActionMode ===
          "operations"
        ) {
          showModal(
            "success",
            "Posunuté prevádzkovému manažérovi",
            "Závada bola odoslaná prevádzkovému manažérovi.",
            `Odoslal: ${loggedManagerName}`
          );
        }
      } catch (error) {
        console.error(error);

        showModal(
          "error",
          "Nastala chyba",
          "Nepodarilo sa spojiť so serverom."
        );
      } finally {
        setActionLoading(false);
      }
    };

  /* =========================================================
     DÁTUM
     ========================================================= */

  const formatDate = (
    dateValue: string | null
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
      !normalized.endsWith("Z") &&
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

  /* =========================================================
     LABELY
     ========================================================= */

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

      case "operations":
        return "U prevádzkového manažéra";

      case "closed":
        return "Vyriešená";

      default:
        return status;
    }
  };

  const eventLabel = (
    type: string
  ) => {
    switch (type) {
      case "created":
        return "Závada nahlásená";

      case "taken":
        return "Závada prevzatá";

      case "resolved":
        return "Závada vyriešená";

      case "material_requested":
        return "Požiadavka na materiál";

      case "escalated_to_manager":
        return "Posunuté vedúcemu";

      case "returned_to_maintenance":
        return "Vrátené údržbe";

      case "manager_resolved":
        return "Uzavreté vedúcim";

      case "escalated_to_operations":
        return "Posunuté prevádzkovému manažérovi";

      default:
        return "Aktualizácia";
    }
  };

  const eventIcon = (
    type: string
  ) => {
    switch (type) {
      case "created":
        return "⚠️";

      case "taken":
        return "🔧";

      case "resolved":
      case "manager_resolved":
        return "✅";

      case "material_requested":
        return "📦";

      case "escalated_to_manager":
      case "escalated_to_operations":
        return "➡️";

      case "returned_to_maintenance":
        return "↩️";

      default:
        return "•";
    }
  };

  /* =========================================================
     FILTRE ÚDRŽBÁRA
     ========================================================= */

  const maintenanceFilteredIssues =
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

  const closedIssues =
    issues.filter(
      (issue) =>
        issue.status ===
        "closed"
    );

  const maintenanceFilterTitle: Record<
    MaintenanceFilter,
    string
  > = {
    new: "Nové závady",
    progress: "Rozpracované",
    material:
      "Čaká na materiál",
    manager:
      "Posunuté vedúcemu",
  };

  /* =========================================================
     FILTRE VEDÚCEHO
     ========================================================= */

  const managerFilteredIssues =
    issues.filter(
      (issue) =>
        issue.status ===
        managerFilter
    );

  const managerMaterialCount =
    issues.filter(
      (issue) =>
        issue.status ===
        "material"
    ).length;

  const managerIncomingCount =
    issues.filter(
      (issue) =>
        issue.status ===
        "manager"
    ).length;

  const operationsCount =
    issues.filter(
      (issue) =>
        issue.status ===
        "operations"
    ).length;

  const closedCount =
    closedIssues.length;

  const managerFilterTitle: Record<
    ManagerFilter,
    string
  > = {
    material:
      "Čaká na materiál",
    manager:
      "Posunuté vedúcemu",
    operations:
      "U prevádzkového manažéra",
    closed:
      "Uzavreté závady",
  };

  /* =========================================================
     MODAL
     ========================================================= */

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

          <h2>
            {modal.title}
          </h2>

          <p>
            {modal.message}
          </p>

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

  /* =========================================================
     ACTION WINDOW ÚDRŽBÁRA
     ========================================================= */

  const maintenanceActionWindow =
    maintenanceActionMode ? (
      <div className="action-overlay">
        <div className="action-dialog">

          <div className="action-handle"></div>

          <div className="action-dialog-icon">
            {maintenanceActionMode ===
            "resolve"
              ? "✅"
              : maintenanceActionMode ===
                "material"
              ? "📦"
              : "➡️"}
          </div>

          <h2>
            {maintenanceActionMode ===
            "resolve"
              ? "Vyriešiť závadu"
              : maintenanceActionMode ===
                "material"
              ? "Čaká na materiál"
              : "Posunúť vedúcemu"}
          </h2>

          <p>
            {maintenanceActionMode ===
            "resolve"
              ? "Napíšte, čo bolo opravené. Môžete priložiť fotografiu po oprave."
              : maintenanceActionMode ===
                "material"
              ? "Napíšte, aký materiál alebo náhradný diel je potrebný."
              : "Napíšte dôvod, prečo závadu posúvate vedúcemu údržby."}
          </p>

          <label className="action-label">
            Komentár

            <textarea
              value={actionComment}
              onChange={(e) =>
                setActionComment(
                  e.target.value
                )
              }
              rows={4}
              placeholder="Napíšte komentár..."
            />
          </label>

          <label className="action-photo-upload">
            <span className="action-camera">
              📷
            </span>

            <div>
              <strong>
                {maintenanceActionMode ===
                "resolve"
                  ? "Fotografia po oprave"
                  : "Priložiť fotografiu"}
              </strong>

              <small>
                Odfotiť alebo vybrať
              </small>
            </div>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const file =
                  e.target.files?.[0] ||
                  null;

                setActionPhoto(file);

                setActionPhotoName(
                  file?.name || ""
                );
              }}
            />
          </label>

          {actionPhotoName && (
            <div className="action-photo-selected">
              ✓ {actionPhotoName}
            </div>
          )}

          <button
            className="action-confirm-button"
            onClick={
              submitMaintenanceAction
            }
            disabled={actionLoading}
          >
            {actionLoading
              ? "Ukladám..."
              : maintenanceActionMode ===
                "resolve"
              ? "✅ Potvrdiť vyriešenie"
              : maintenanceActionMode ===
                "material"
              ? "📦 Uložiť požiadavku"
              : "➡️ Posunúť vedúcemu"}
          </button>

          <button
            className="action-cancel-button"
            onClick={
              closeMaintenanceAction
            }
            disabled={actionLoading}
          >
            Zrušiť
          </button>

        </div>
      </div>
    ) : null;

  /* =========================================================
     ACTION WINDOW VEDÚCEHO
     ========================================================= */

  const managerActionWindow =
    managerActionMode ? (
      <div className="action-overlay">
        <div className="action-dialog manager-action-dialog">

          <div className="action-handle"></div>

          <div className="manager-dialog-role">
            VEDÚCI ÚDRŽBY
          </div>

          <div className="action-dialog-icon">
            {managerActionMode ===
            "return"
              ? "↩️"
              : managerActionMode ===
                "close"
              ? "✅"
              : "⬆️"}
          </div>

          <h2>
            {managerActionMode ===
            "return"
              ? "Vrátiť údržbe"
              : managerActionMode ===
                "close"
              ? "Uzavrieť závadu"
              : "Posunúť prevádzkovému manažérovi"}
          </h2>

          <p>
            {managerActionMode ===
            "return"
              ? "Závada sa opäť objaví medzi novými závadami a môže ju prevziať údržbár."
              : managerActionMode ===
                "close"
              ? "Uzavrite závadu a napíšte dôvod alebo vykonaný zásah."
              : "Závadu posuniete na ďalšie rozhodnutie prevádzkovému manažérovi."}
          </p>

          <label className="action-label">
            Komentár

            <textarea
              value={
                managerActionComment
              }
              onChange={(e) =>
                setManagerActionComment(
                  e.target.value
                )
              }
              rows={4}
              placeholder={
                managerActionMode ===
                "return"
                  ? "Čo má údržba ešte vykonať?"
                  : managerActionMode ===
                    "close"
                  ? "Prečo je možné závadu uzavrieť?"
                  : "Prečo je potrebné rozhodnutie prevádzkového manažéra?"
              }
            />
          </label>

          <label className="action-photo-upload">
            <span className="action-camera">
              📷
            </span>

            <div>
              <strong>
                Priložiť fotografiu
              </strong>

              <small>
                Voliteľné
              </small>
            </div>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const file =
                  e.target.files?.[0] ||
                  null;

                setManagerActionPhoto(
                  file
                );

                setManagerActionPhotoName(
                  file?.name || ""
                );
              }}
            />
          </label>

          {managerActionPhotoName && (
            <div className="action-photo-selected">
              ✓{" "}
              {managerActionPhotoName}
            </div>
          )}

          <button
            className="action-confirm-button"
            onClick={
              submitManagerAction
            }
            disabled={actionLoading}
          >
            {actionLoading
              ? "Ukladám..."
              : managerActionMode ===
                "return"
              ? "↩️ Vrátiť údržbe"
              : managerActionMode ===
                "close"
              ? "✅ Uzavrieť závadu"
              : "⬆️ Posunúť manažérovi"}
          </button>

          <button
            className="action-cancel-button"
            onClick={
              closeManagerAction
            }
            disabled={actionLoading}
          >
            Zrušiť
          </button>

        </div>
      </div>
    ) : null;

  /* =========================================================
     ZDIEĽANÁ HISTÓRIA DETAIL
     ========================================================= */

  const renderHistoryDetail = (
    returnScreen:
      | "maintenance-history"
      | "manager-history",
    titleRole:
      | "ÚDRŽBA"
      | "VEDÚCI ÚDRŽBY"
  ) => {
    if (!selectedIssue) return null;

    return (
      <>
        <main className="app-shell">
          <section className="app-card history-detail-card">

            <div className="top-bar">
              <button
                className="back-button"
                onClick={() =>
                  setScreen(returnScreen)
                }
              >
                ← História
              </button>

              <img
                src={tatralandiaLogo}
                alt="Tatralandia"
                className="small-logo"
              />
            </div>

            <div className="history-detail-number">
              {titleRole} • ZÁVADA #
              {String(
                selectedIssue.id
              ).padStart(
                4,
                "0"
              )}
            </div>

            <div className="history-closed-badge">
              ✓ VYRIEŠENÁ
            </div>

            <h1 className="history-detail-title">
              {
                selectedIssue.description
              }
            </h1>

            <div className="history-summary-box">

              <div>
                <small>MIESTO</small>
                <strong>
                  {
                    selectedIssue.location
                  }
                </strong>
              </div>

              <div>
                <small>NAHLÁSIL</small>
                <strong>
                  {
                    selectedIssue.reporter_name
                  }
                </strong>
              </div>

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

              <div>
                <small>
                  UZAVRETÉ
                </small>
                <strong>
                  {formatDate(
                    selectedIssue.closed_at
                  )}
                </strong>
              </div>

            </div>

            {selectedIssue.photo_key && (
              <div className="history-original-photo">

                <div className="history-photo-label">
                  PÔVODNÁ FOTOGRAFIA
                </div>

                <img
                  src={getPhotoUrl(
                    selectedIssue.photo_key
                  )}
                  alt="Pôvodná fotografia"
                />

              </div>
            )}

            <div className="timeline-title">
              HISTÓRIA ZÁVADY
            </div>

            {historyLoading ? (
              <div className="loading-box">
                Načítavam históriu...
              </div>
            ) : issueEvents.length ===
              0 ? (
              <div className="empty-box">
                História nie je
                dostupná.
              </div>
            ) : (
              <div className="history-timeline">

                {issueEvents.map(
                  (event) => (
                    <div
                      className="timeline-item"
                      key={event.id}
                    >

                      <div className="timeline-icon">
                        {eventIcon(
                          event.event_type
                        )}
                      </div>

                      <div className="timeline-content">

                        <div className="timeline-head">
                          <strong>
                            {eventLabel(
                              event.event_type
                            )}
                          </strong>

                          <span>
                            {formatDate(
                              event.created_at
                            )}
                          </span>
                        </div>

                        {event.actor_name && (
                          <div className="timeline-actor">
                            👤{" "}
                            {
                              event.actor_name
                            }
                          </div>
                        )}

                        {event.message && (
                          <p>
                            {
                              event.message
                            }
                          </p>
                        )}

                        {event.photo_key && (
                          <img
                            src={getPhotoUrl(
                              event.photo_key
                            )}
                            alt="Fotografia udalosti"
                            className="timeline-photo"
                          />
                        )}

                      </div>

                    </div>
                  )
                )}

              </div>
            )}

          </section>
        </main>

        {modalWindow}
      </>
    );
  };

  /* =========================================================
     MANAGER HISTORY DETAIL
     ========================================================= */

  if (
    screen ===
    "manager-history-detail"
  ) {
    return renderHistoryDetail(
      "manager-history",
      "VEDÚCI ÚDRŽBY"
    );
  }

  /* =========================================================
     MAINTENANCE HISTORY DETAIL
     ========================================================= */

  if (
    screen ===
    "maintenance-history-detail"
  ) {
    return renderHistoryDetail(
      "maintenance-history",
      "ÚDRŽBA"
    );
  }

  /* =========================================================
     MANAGER HISTORY
     ========================================================= */

  if (
    screen ===
    "manager-history"
  ) {
    return (
      <>
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
                onClick={logoutManager}
              >
                Odhlásiť
              </button>
            </div>

            <div className="manager-header-badge">
              VEDÚCI ÚDRŽBY
            </div>

            <div className="history-header">
              <div>
                <div className="section-label">
                  ARCHÍV
                </div>

                <h1>História</h1>
              </div>

              <div className="history-count">
                {closedCount}
              </div>
            </div>

            <p className="history-subtitle">
              Kompletný zoznam uzavretých
              závad.
            </p>

            <div className="history-list">

              {issuesLoading ? (
                <div className="loading-box">
                  Načítavam...
                </div>
              ) : closedIssues.length ===
                0 ? (
                <div className="empty-box">
                  Zatiaľ nie sú žiadne
                  uzavreté závady.
                </div>
              ) : (
                closedIssues.map(
                  (issue) => (
                    <button
                      className="history-card"
                      key={issue.id}
                      onClick={async () => {
                        setSelectedIssue(
                          issue
                        );

                        setIssueEvents([]);

                        setScreen(
                          "manager-history-detail"
                        );

                        await loadIssueEvents(
                          issue.id
                        );
                      }}
                    >

                      <div className="history-card-status">
                        ✓
                      </div>

                      <div className="history-card-main">

                        <div className="history-card-top">
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
                              issue.closed_at ||
                                issue.updated_at
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

                        <small>
                          Uzavrel:{" "}
                          {issue.last_actor_name ||
                            "Údržba"}
                        </small>

                      </div>

                      {issue.photo_key ? (
                        <img
                          src={getPhotoUrl(
                            issue.photo_key
                          )}
                          className="history-card-photo"
                          alt="Fotografia"
                        />
                      ) : (
                        <div className="history-card-no-photo">
                          📷
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

            <div className="maintenance-bottom-menu">

              <button
                onClick={() =>
                  setScreen(
                    "manager-dashboard"
                  )
                }
              >
                <span>🛠️</span>
                Prehľad
              </button>

              <button className="bottom-menu-active">
                <span>📋</span>
                História
              </button>

            </div>

          </section>
        </main>

        {modalWindow}
      </>
    );
  }

  /* =========================================================
     MANAGER ISSUE DETAIL
     ========================================================= */

  if (
    screen ===
      "manager-issue" &&
    selectedIssue
  ) {
    const isManagerActionable =
      selectedIssue.status ===
        "manager" ||
      selectedIssue.status ===
        "material";

    return (
      <>
        <main className="app-shell">

          <section className="app-card issue-detail-card">

            <div className="top-bar">

              <button
                className="back-button"
                onClick={() =>
                  setScreen(
                    "manager-dashboard"
                  )
                }
              >
                ← Prehľad
              </button>

              <img
                src={tatralandiaLogo}
                alt="Tatralandia"
                className="small-logo"
              />

            </div>

            <div className="manager-detail-role">
              VEDÚCI ÚDRŽBY
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
                  🔧
                </span>

                <div>
                  <small>
                    POSLEDNÁ AKCIA
                  </small>

                  <strong>
                    {selectedIssue.last_actor_name ||
                      "—"}
                  </strong>
                </div>
              </div>

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
                  Bez fotografie
                </strong>
              </div>
            )}

            {isManagerActionable && (
              <>
                <div className="manager-task-alert">
                  <span>🛠️</span>

                  <div>
                    <small>
                      VYŽADUJE ROZHODNUTIE
                    </small>

                    <strong>
                      Táto závada čaká na
                      vedúceho údržby.
                    </strong>
                  </div>
                </div>

                <div className="issue-actions-title">
                  AKCIA VEDÚCEHO
                </div>

                <div className="issue-action-buttons">

                  <button
                    className="issue-action-button manager-return-button"
                    onClick={() =>
                      openManagerAction(
                        "return"
                      )
                    }
                  >
                    <span>↩️</span>

                    <div>
                      <strong>
                        Vrátiť údržbe
                      </strong>

                      <small>
                        Na ďalšie riešenie
                      </small>
                    </div>
                  </button>

                  <button
                    className="issue-action-button action-resolve"
                    onClick={() =>
                      openManagerAction(
                        "close"
                      )
                    }
                  >
                    <span>✅</span>

                    <div>
                      <strong>
                        Uzavrieť závadu
                      </strong>

                      <small>
                        Označiť ako vyriešenú
                      </small>
                    </div>
                  </button>

                  <button
                    className="issue-action-button manager-operations-button"
                    onClick={() =>
                      openManagerAction(
                        "operations"
                      )
                    }
                  >
                    <span>⬆️</span>

                    <div>
                      <strong>
                        Prevádzkový manažér
                      </strong>

                      <small>
                        Posunúť na rozhodnutie
                      </small>
                    </div>
                  </button>

                </div>
              </>
            )}

            {selectedIssue.status ===
              "operations" && (
              <div className="manager-waiting-info">

                <span>📊</span>

                <div>
                  <small>
                    POSUNUTÉ ĎALEJ
                  </small>

                  <strong>
                    Závada čaká na
                    prevádzkového manažéra.
                  </strong>
                </div>

              </div>
            )}

            {selectedIssue.status ===
              "closed" && (
              <div className="resolved-info">

                <span>✓</span>

                <div>
                  <small>
                    ZÁVADA UKONČENÁ
                  </small>

                  <strong>
                    Uzavrel:{" "}
                    {selectedIssue.last_actor_name ||
                      "Údržba"}
                  </strong>
                </div>

              </div>
            )}

            <button
              className="detail-back-button"
              onClick={() =>
                setScreen(
                  "manager-dashboard"
                )
              }
            >
              Späť na prehľad
            </button>

          </section>

        </main>

        {modalWindow}
        {managerActionWindow}
      </>
    );
  }

  /* =========================================================
     MANAGER DASHBOARD
     ========================================================= */

  if (
    screen ===
    "manager-dashboard"
  ) {
    return (
      <>
        <main className="app-shell">

          <section className="app-card dashboard-card manager-dashboard">

            <div className="dashboard-header">

              <img
                src={tatralandiaLogo}
                alt="Tatralandia"
                className="dashboard-logo"
              />

              <button
                className="logout-button"
                onClick={logoutManager}
              >
                Odhlásiť
              </button>

            </div>

            <div className="manager-header-badge">
              VEDÚCI ÚDRŽBY
            </div>

            <div className="welcome-block manager-welcome">

              <div>
                <span>
                  PRIHLÁSENÝ VEDÚCI
                </span>

                <h2>
                  {loggedManagerName}
                </h2>
              </div>

              <div className="worker-avatar">
                🛠️
              </div>

            </div>

            <div className="dashboard-title-row">

              <div>
                <div className="section-label">
                  RIADENIE ÚDRŽBY
                </div>

                <h1>
                  Prehľad
                </h1>
              </div>

              <button
                className="notification-bell"
                onClick={loadIssues}
              >
                🔔

                {(managerIncomingCount +
                  managerMaterialCount) >
                  0 && (
                  <span>
                    {managerIncomingCount +
                      managerMaterialCount}
                  </span>
                )}

              </button>

            </div>

            <div className="manager-stats-grid">

              <button
                className={`manager-stat-card ${
                  managerFilter ===
                  "material"
                    ? "manager-stat-active"
                    : ""
                }`}
                onClick={() =>
                  setManagerFilter(
                    "material"
                  )
                }
              >
                <span className="manager-stat-icon">
                  📦
                </span>

                <strong>
                  {managerMaterialCount}
                </strong>

                <span>
                  Čaká na materiál
                </span>
              </button>

              <button
                className={`manager-stat-card ${
                  managerFilter ===
                  "manager"
                    ? "manager-stat-active"
                    : ""
                }`}
                onClick={() =>
                  setManagerFilter(
                    "manager"
                  )
                }
              >
                <span className="manager-stat-icon">
                  🛠️
                </span>

                <strong>
                  {managerIncomingCount}
                </strong>

                <span>
                  Posunuté mne
                </span>
              </button>

              <button
                className={`manager-stat-card ${
                  managerFilter ===
                  "operations"
                    ? "manager-stat-active"
                    : ""
                }`}
                onClick={() =>
                  setManagerFilter(
                    "operations"
                  )
                }
              >
                <span className="manager-stat-icon">
                  📊
                </span>

                <strong>
                  {operationsCount}
                </strong>

                <span>
                  U manažéra
                </span>
              </button>

              <button
                className={`manager-stat-card ${
                  managerFilter ===
                  "closed"
                    ? "manager-stat-active"
                    : ""
                }`}
                onClick={() =>
                  setManagerFilter(
                    "closed"
                  )
                }
              >
                <span className="manager-stat-icon">
                  ✅
                </span>

                <strong>
                  {closedCount}
                </strong>

                <span>
                  Uzavreté
                </span>
              </button>

            </div>

            <div className="dashboard-section">

              <div className="dashboard-section-heading">

                <strong>
                  {
                    managerFilterTitle[
                      managerFilter
                    ]
                  }
                </strong>

                <span>
                  {
                    managerFilteredIssues.length
                  }{" "}
                  položiek
                </span>

              </div>

              <div className="issue-list">

                {issuesLoading ? (
                  <div className="loading-box">
                    Načítavam závady...
                  </div>
                ) : managerFilteredIssues.length ===
                  0 ? (
                  <div className="empty-box">
                    V tejto kategórii
                    momentálne nie sú
                    žiadne závady.
                  </div>
                ) : (
                  managerFilteredIssues.map(
                    (issue) => (
                      <button
                        className="issue-card-new manager-issue-card"
                        key={issue.id}
                        onClick={() => {
                          setSelectedIssue(
                            issue
                          );

                          setScreen(
                            "manager-issue"
                          );
                        }}
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
                                issue.updated_at
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
                            Posledná akcia:{" "}
                            <strong>
                              {issue.last_actor_name ||
                                "—"}
                            </strong>
                          </div>

                        </div>

                        {issue.photo_key ? (
                          <img
                            src={getPhotoUrl(
                              issue.photo_key
                            )}
                            alt="Fotografia"
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
                <span>🛠️</span>
                Prehľad
              </button>

              <button
                onClick={() =>
                  setScreen(
                    "manager-history"
                  )
                }
              >
                <span>📋</span>
                História
              </button>

            </div>

          </section>

        </main>

        {modalWindow}
      </>
    );
  }

  /* =========================================================
     MANAGER LOGIN
     ========================================================= */

  if (
    screen === "manager-login"
  ) {
    return (
      <>
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

            <div className="manager-login-icon">
              🛠️
            </div>

            <div className="section-badge">
              VEDÚCI ÚDRŽBY
            </div>

            <h1>
              Prihlásenie vedúceho
            </h1>

            <p className="subtitle">
              Zadajte svoje meno a spoločné
              heslo vedúcich údržby.
            </p>

            <form
              className="report-form"
              onSubmit={loginManager}
            >

              <label>
                Vaše meno

                <input
                  type="text"
                  placeholder="Napr. Peter, Ľubo, Jaro..."
                  value={managerName}
                  onChange={(e) =>
                    setManagerName(
                      e.target.value
                    )
                  }
                />
              </label>

              <label>
                Heslo vedúceho

                <input
                  className="password-input"
                  type="password"
                  placeholder="Zadajte heslo"
                  value={
                    managerPassword
                  }
                  onChange={(e) =>
                    setManagerPassword(
                      e.target.value
                    )
                  }
                />
              </label>

              <button
                className="submit-button"
                type="submit"
              >
                🛠️ Prihlásiť sa
              </button>

            </form>

            <div className="test-password">
              Testovacie heslo:{" "}
              <strong>
                veduci1234
              </strong>
            </div>

          </section>

        </main>

        {modalWindow}
      </>
    );
  }

  /* =========================================================
     MAINTENANCE HISTORY
     ========================================================= */

  if (
    screen ===
    "maintenance-history"
  ) {
    return (
      <>
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

            <div className="history-header">

              <div>

                <div className="section-label">
                  ARCHÍV ÚDRŽBY
                </div>

                <h1>
                  História
                </h1>

              </div>

              <div className="history-count">
                {closedCount}
              </div>

            </div>

            <p className="history-subtitle">
              Všetky vyriešené a
              uzavreté závady.
            </p>

            <div className="history-list">

              {closedIssues.map(
                (issue) => (
                  <button
                    className="history-card"
                    key={issue.id}
                    onClick={async () => {
                      setSelectedIssue(
                        issue
                      );

                      setIssueEvents([]);

                      setScreen(
                        "maintenance-history-detail"
                      );

                      await loadIssueEvents(
                        issue.id
                      );
                    }}
                  >

                    <div className="history-card-status">
                      ✓
                    </div>

                    <div className="history-card-main">

                      <div className="history-card-top">

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
                            issue.closed_at ||
                              issue.updated_at
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

                      <small>
                        Vyriešil:{" "}
                        {issue.last_actor_name ||
                          "Údržba"}
                      </small>

                    </div>

                    {issue.photo_key ? (
                      <img
                        src={getPhotoUrl(
                          issue.photo_key
                        )}
                        alt="Fotografia"
                        className="history-card-photo"
                      />
                    ) : (
                      <div className="history-card-no-photo">
                        📷
                      </div>
                    )}

                    <div className="issue-arrow">
                      ›
                    </div>

                  </button>
                )
              )}

            </div>

            <div className="maintenance-bottom-menu">

              <button
                onClick={() =>
                  setScreen(
                    "maintenance-dashboard"
                  )
                }
              >
                <span>🔧</span>
                Závady
              </button>

              <button className="bottom-menu-active">
                <span>📋</span>
                História
              </button>

            </div>

          </section>

        </main>

        {modalWindow}
      </>
    );
  }

  /* =========================================================
     MAINTENANCE ISSUE
     ========================================================= */

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
                src={tatralandiaLogo}
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
                  Bez fotografie
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
              <>
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

                <div className="issue-actions-title">
                  ČO CHCETE UROBIŤ?
                </div>

                <div className="issue-action-buttons">

                  <button
                    className="issue-action-button action-resolve"
                    onClick={() =>
                      openMaintenanceAction(
                        "resolve"
                      )
                    }
                  >
                    <span>✅</span>

                    <div>
                      <strong>
                        Vyriešené
                      </strong>
                      <small>
                        Uzavrieť závadu
                      </small>
                    </div>
                  </button>

                  <button
                    className="issue-action-button action-material"
                    onClick={() =>
                      openMaintenanceAction(
                        "material"
                      )
                    }
                  >
                    <span>📦</span>

                    <div>
                      <strong>
                        Čaká na materiál
                      </strong>
                      <small>
                        Potrebujem diel
                      </small>
                    </div>
                  </button>

                  <button
                    className="issue-action-button action-manager"
                    onClick={() =>
                      openMaintenanceAction(
                        "manager"
                      )
                    }
                  >
                    <span>➡️</span>

                    <div>
                      <strong>
                        Posunúť vedúcemu
                      </strong>
                      <small>
                        Potrebujem pomoc
                      </small>
                    </div>
                  </button>

                </div>
              </>
            )}

          </section>

        </main>

        {modalWindow}
        {maintenanceActionWindow}
      </>
    );
  }

  /* =========================================================
     MAINTENANCE DASHBOARD
     ========================================================= */

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

            <div className="stats-grid">

              {(
                [
                  [
                    "new",
                    newCount,
                    "Nové závady",
                  ],
                  [
                    "progress",
                    progressCount,
                    "Rozpracované",
                  ],
                  [
                    "material",
                    materialCount,
                    "Čaká na materiál",
                  ],
                  [
                    "manager",
                    managerCount,
                    "U vedúceho",
                  ],
                ] as const
              ).map(
                ([
                  status,
                  count,
                  label,
                ]) => (
                  <button
                    key={status}
                    className={`stat-card ${
                      maintenanceFilter ===
                      status
                        ? "stat-active"
                        : ""
                    }`}
                    onClick={() =>
                      setMaintenanceFilter(
                        status
                      )
                    }
                  >
                    <span className="stat-number">
                      {count}
                    </span>

                    <span className="stat-title">
                      {label}
                    </span>
                  </button>
                )
              )}

            </div>

            <div className="dashboard-section">

              <div className="dashboard-section-heading">

                <strong>
                  {
                    maintenanceFilterTitle[
                      maintenanceFilter
                    ]
                  }
                </strong>

                <span>
                  {
                    maintenanceFilteredIssues.length
                  }{" "}
                  položiek
                </span>

              </div>

              <div className="issue-list">

                {maintenanceFilteredIssues.map(
                  (issue) => (
                    <button
                      className="issue-card-new"
                      key={issue.id}
                      onClick={() => {
                        setSelectedIssue(
                          issue
                        );

                        setScreen(
                          "maintenance-issue"
                        );
                      }}
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

                      </div>

                      {issue.photo_key ? (
                        <img
                          src={getPhotoUrl(
                            issue.photo_key
                          )}
                          className="issue-photo"
                          alt="Fotografia"
                        />
                      ) : (
                        <div className="issue-no-photo">
                          📷
                        </div>
                      )}

                      <div className="issue-arrow">
                        ›
                      </div>

                    </button>
                  )
                )}

              </div>

            </div>

            <div className="maintenance-bottom-menu">

              <button className="bottom-menu-active">
                <span>🔧</span>
                Závady
              </button>

              <button
                onClick={() =>
                  setScreen(
                    "maintenance-history"
                  )
                }
              >
                <span>📋</span>
                História
              </button>

            </div>

          </section>

        </main>

        {modalWindow}
      </>
    );
  }

  /* =========================================================
     MAINTENANCE LOGIN
     ========================================================= */

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

            <form
              className="report-form"
              onSubmit={
                loginMaintenance
              }
            >

              <label>
                Vaše meno

                <input
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
                  type="password"
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

        {modalWindow}
      </>
    );
  }

  /* =========================================================
     REPORT
     ========================================================= */

  if (screen === "report") {
    return (
      <>
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

            <form
              className="report-form"
              onSubmit={submitReport}
            >

              <label>
                Kto nahlasuje?

                <input
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
                    Odfotiť alebo vybrať
                  </span>
                </div>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0] ||
                      null;

                    setPhotoFile(file);

                    setPhotoName(
                      file?.name || ""
                    );
                  }}
                />

              </label>

              {photoName && (
                <div className="photo-selected">
                  ✓ {photoName}
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

  /* =========================================================
     SUCCESS
     ========================================================= */

  if (
    screen === "success"
  ) {
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
            údržbe.
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

  /* =========================================================
     HOME
     ========================================================= */

  return (
    <>
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
                  Nové a rozpracované závady
                </span>
              </div>

              <div className="role-arrow">
                ›
              </div>
            </button>

            <button
              className="role-button"
              onClick={() =>
                setScreen(
                  "manager-login"
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
                  Riadenie úloh a štatistika
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
                  "Túto časť aplikácie vytvoríme v ďalšej fáze."
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
                  Kompletný prehľad a riadenie
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

      {modalWindow}
    </>
  );
}

export default App;
