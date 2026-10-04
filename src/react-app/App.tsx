import { Component, useEffect, useState, type ReactNode } from "react";
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
  | "manager-decision"
  | "manager-issue"
  | "manager-history"
  | "manager-history-detail"
  | "manager-statistics"
  | "operations-login"
  | "operations-dashboard"
  | "operations-decision"
  | "operations-issue"
  | "operations-history"
  | "operations-history-detail"
  | "operations-statistics"
  | "operations-new-task";

type MaintenanceFilter =
  | "new"
  | "progress"
  | "material"
  | "manager";

type OperationsStatusFilter =
  | "all"
  | "new"
  | "progress"
  | "material"
  | "manager"
  | "operations"
  | "closed";

type OperationsActionMode =
  | "return_manager"
  | "close"
  | "reopen"
  | null;

type MaintenanceActionMode =
  | "resolve"
  | "material"
  | "manager"
  | null;

type ManagerActionMode =
  | "return"
  | "close"
  | "operations"
  | "reopen"
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
  event_text?: string;
  rating_up_count?: number;
  rating_down_count?: number;
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

type RatingRecord = {
  id: number;
  issue_id: number;
  event_type: "rating_up" | "rating_down";
  actor_role: string | null;
  actor_name: string | null;
  message: string | null;
  created_at: string;
  rated_worker_name?: string | null;
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

type DuplicateCandidate = {
  id: number;
  location: string;
  description: string;
  photo_key: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  score: number;
};

type MaintenanceMessage = {
  id: number;
  sender_name: string;
  category: string;
  subject: string;
  message: string;
  photo_key: string | null;
  status: "open" | "resolved" | "converted" | string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  reply_count?: number;
};

type MessageReply = {
  id: number;
  message_id: number;
  actor_role: string;
  actor_name: string;
  message: string;
  photo_key: string | null;
  created_at: string;
};

type AlertType = "critical" | "outage" | "planned" | "info";

type AlertItem = {
  id: number;
  alert_type: AlertType;
  title: string;
  location: string;
  description: string;
  start_date: string;
  end_date: string;
  audiences: string;
  photo_key: string | null;
  created_by_role: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const APP_VERSION = "1.4.3";

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Tatralandia UI error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-screen">
          <div className="fatal-card">
            <div className="fatal-icon">!</div>
            <h1>Aplikáciu sa nepodarilo zobraziť</h1>
            <p>
              Skúste aplikáciu obnoviť. Rozpracované údaje v databáze sa tým nezmažú.
            </p>
            <button onClick={() => window.location.reload()}>
              Obnoviť aplikáciu
            </button>
            <small>Verzia {APP_VERSION}</small>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 12000,
  retries = 1
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      return response;
    } catch (error) {
      window.clearTimeout(timer);
      lastError = error;
      if (attempt >= retries) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 650));
    }
  }
  throw lastError;
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarCells(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = mondayOffset - 1; i >= 0; i -= 1) {
    cells.push({ date: new Date(year, month, -i), inMonth: false });
  }
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const lastCell = cells[cells.length - 1].date;
    cells.push({
      date: new Date(lastCell.getFullYear(), lastCell.getMonth(), lastCell.getDate() + 1),
      inMonth: false,
    });
  }
  return cells;
}

function PhotoChoice({
  fileName,
  onFile,
  title = "Pridať fotografiu",
}: {
  fileName: string;
  onFile: (file: File | null) => void;
  title?: string;
}) {
  const handle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    onFile(file);
    event.target.value = "";
  };

  return (
    <div className="photo-choice-wrap">
      <div className="photo-choice-title">{title}</div>
      <div className="photo-choice-grid">
        <label className="photo-choice-button camera-choice">
          <span>📷</span>
          <strong>Odfotiť teraz</strong>
          <small>Otvoriť fotoaparát</small>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handle}
          />
        </label>
        <label className="photo-choice-button gallery-choice">
          <span>🖼️</span>
          <strong>Vybrať z galérie</strong>
          <small>Fotka uložená v mobile</small>
          <input
            type="file"
            accept="image/*"
            onChange={handle}
          />
        </label>
      </div>
      {fileName && <div className="photo-selected">✓ {fileName}</div>}
    </div>
  );
}

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


  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [loginLoadingRole, setLoginLoadingRole] = useState<string | null>(null);

  const [duplicateCandidates, setDuplicateCandidates] =
    useState<DuplicateCandidate[]>([]);
  const [duplicateWindowOpen, setDuplicateWindowOpen] = useState(false);
  const [duplicateSubmitting, setDuplicateSubmitting] = useState(false);

  const [messages, setMessages] = useState<MaintenanceMessage[]>([]);
  const [messageReplies, setMessageReplies] = useState<MessageReply[]>([]);
  const [messagesPanelRole, setMessagesPanelRole] =
    useState<"maintenance" | "manager" | null>(null);
  const [selectedMessage, setSelectedMessage] =
    useState<MaintenanceMessage | null>(null);
  const [messageComposerOpen, setMessageComposerOpen] = useState(false);
  const [messageCategory, setMessageCategory] = useState("nakup");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messagePhoto, setMessagePhoto] = useState<File | null>(null);
  const [messagePhotoName, setMessagePhotoName] = useState("");
  const [messageReplyText, setMessageReplyText] = useState("");
  const [messageReplyPhoto, setMessageReplyPhoto] = useState<File | null>(null);
  const [messageReplyPhotoName, setMessageReplyPhotoName] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [publicAlerts, setPublicAlerts] = useState<AlertItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);
  const [alertsAudience, setAlertsAudience] =
    useState<"public" | "maintenance" | "management">("public");
  const [alertEditorOpen, setAlertEditorOpen] = useState(false);
  const [alertType, setAlertType] = useState<AlertType>("critical");
  const [alertTitle, setAlertTitle] = useState("");
  const [alertLocation, setAlertLocation] = useState("");
  const [alertDescription, setAlertDescription] = useState("");
  const [alertStartDate, setAlertStartDate] = useState("");
  const [alertEndDate, setAlertEndDate] = useState("");
  const [alertAudiences, setAlertAudiences] = useState<string[]>([
    "public",
    "maintenance",
    "management",
  ]);
  const [alertPhoto, setAlertPhoto] = useState<File | null>(null);
  const [alertPhotoName, setAlertPhotoName] = useState("");
  const [alertSubmitError, setAlertSubmitError] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [featureLoading, setFeatureLoading] = useState(false);

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

  const [managerStatusFilter, setManagerStatusFilter] =
    useState<OperationsStatusFilter>("all");

  const [managerSearch, setManagerSearch] =
    useState("");

  const [managerAgeFilter, setManagerAgeFilter] =
    useState(0);

  const [managerStaleFilter, setManagerStaleFilter] =
    useState(0);

  /* =========================================================
     PREVÁDZKOVÝ MANAŽÉR
     ========================================================= */

  const [operationsName, setOperationsName] =
    useState("");
  const [operationsPassword, setOperationsPassword] =
    useState("");
  const [loggedOperationsName, setLoggedOperationsName] =
    useState("");
  const [operationsStatusFilter, setOperationsStatusFilter] =
    useState<OperationsStatusFilter>("all");
  const [operationsSearch, setOperationsSearch] =
    useState("");
  const [operationsAgeFilter, setOperationsAgeFilter] =
    useState(0);
  const [operationsStaleFilter, setOperationsStaleFilter] =
    useState(0);
  const [operationsIssueReturn, setOperationsIssueReturn] =
    useState<"operations-dashboard" | "operations-decision">(
      "operations-dashboard"
    );

  const [operationsActionMode, setOperationsActionMode] =
    useState<OperationsActionMode>(null);
  const [operationsActionComment, setOperationsActionComment] =
    useState("");
  const [operationsActionPhoto, setOperationsActionPhoto] =
    useState<File | null>(null);
  const [operationsActionPhotoName, setOperationsActionPhotoName] =
    useState("");

  const [taskLocation, setTaskLocation] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPhoto, setTaskPhoto] = useState<File | null>(null);
  const [taskPhotoName, setTaskPhotoName] = useState("");

  const [ratings, setRatings] = useState<RatingRecord[]>([]);
  const [ratingChoice, setRatingChoice] =
    useState<"up" | "down" | null>(null);
  const [ratingComment, setRatingComment] = useState("");

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

  const compressImageForUpload = async (
    file: File
  ): Promise<File> => {
    if (
      !file.type.startsWith("image/") ||
      file.type === "image/gif" ||
      file.size < 700 * 1024
    ) {
      return file;
    }

    try {
      const imageBitmap =
        await createImageBitmap(file);

      const maxDimension = 1600;
      const scale = Math.min(
        1,
        maxDimension /
          Math.max(
            imageBitmap.width,
            imageBitmap.height
          )
      );

      const width = Math.max(
        1,
        Math.round(
          imageBitmap.width * scale
        )
      );
      const height = Math.max(
        1,
        Math.round(
          imageBitmap.height * scale
        )
      );

      const canvas =
        document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      const context =
        canvas.getContext("2d");

      if (!context) {
        imageBitmap.close();
        return file;
      }

      context.drawImage(
        imageBitmap,
        0,
        0,
        width,
        height
      );

      imageBitmap.close();

      const blob =
        await new Promise<Blob | null>(
          (resolve) =>
            canvas.toBlob(
              resolve,
              "image/jpeg",
              0.78
            )
        );

      if (
        !blob ||
        blob.size >= file.size
      ) {
        return file;
      }

      const baseName =
        file.name.replace(
          /\.[^.]+$/,
          ""
        ) || "foto";

      return new File(
        [blob],
        `${baseName}.jpg`,
        {
          type: "image/jpeg",
          lastModified: Date.now(),
        }
      );
    } catch (error) {
      console.warn(
        "Kompresia fotografie sa nepodarila, odosiela sa originál.",
        error
      );

      return file;
    }
  };

  /* =========================================================
     NAČÍTANIE ZÁVAD + STABILITA SIETE
     ========================================================= */

  const loadIssues = async (): Promise<boolean> => {
    try {
      setIssuesLoading(true);
      const response = await fetchWithRetry("/api/issues", undefined, 12000, 1);
      const data = await response.json();
      if (!response.ok || !data.success) {
        showModal(
          "error",
          "Nepodarilo sa načítať závady",
          data.error || "Skúste aplikáciu načítať znova."
        );
        return false;
      }
      setIssues(data.issues || []);
      return true;
    } catch (error) {
      console.error(error);
      showModal(
        "error",
        "Chyba spojenia",
        navigator.onLine
          ? "Server momentálne neodpovedá. Skúste to znova."
          : "Telefón je offline. Po pripojení skúste načítanie znova."
      );
      return false;
    } finally {
      setIssuesLoading(false);
    }
  };

  const loadRatings = async () => {
    try {
      const response = await fetchWithRetry("/api/ratings", undefined, 10000, 1);
      const data = await response.json();
      if (response.ok && data.success) {
        setRatings(data.ratings || []);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loadAlerts = async (
    audience: "public" | "maintenance" | "management",
    includeAll = false
  ) => {
    try {
      const query = new URLSearchParams({
        audience,
        today: localDateString(),
      });
      if (includeAll) query.set("all", "1");
      const response = await fetchWithRetry(`/api/alerts?${query.toString()}`, undefined, 10000, 1);
      const data = await response.json();
      if (response.ok && data.success) {
        const rows = (data.alerts || []) as AlertItem[];
        setAlerts(rows);
        if (audience === "public" && !includeAll) setPublicAlerts(rows);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const openAlerts = async (
    audience: "public" | "maintenance" | "management",
    includeAll = false
  ) => {
    setAlertsAudience(audience);
    setAlertsPanelOpen(true);
    await loadAlerts(audience, includeAll);
  };

  const loadMessages = async (role: "maintenance" | "manager") => {
    try {
      setMessagesLoading(true);
      const query = new URLSearchParams({ role });
      if (role === "maintenance") {
        query.set("maintenance_name", loggedMaintenanceName || maintenanceName.trim());
      }
      const response = await fetchWithRetry(`/api/messages?${query.toString()}`, undefined, 10000, 1);
      const data = await response.json();
      if (response.ok && data.success) setMessages(data.messages || []);
    } catch (error) {
      console.error(error);
      showModal("error", "Správy sa nenačítali", "Skúste to znova.");
    } finally {
      setMessagesLoading(false);
    }
  };

  const openMessages = async (role: "maintenance" | "manager") => {
    setMessagesPanelRole(role);
    setSelectedMessage(null);
    setMessageReplies([]);
    setMessageComposerOpen(false);
    await loadMessages(role);
  };

  const loadMessageReplies = async (messageId: number) => {
    try {
      const response = await fetchWithRetry(`/api/messages/${messageId}/replies`, undefined, 10000, 1);
      const data = await response.json();
      if (response.ok && data.success) setMessageReplies(data.replies || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    const onWindowError = (event: ErrorEvent) => {
      console.error("Window error", event.error || event.message);
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise", event.reason);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandled);
    void loadAlerts("public", false);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

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
     NAHLÁSENIE ZÁVADY + KONTROLA DUPLÍCÍT
     ========================================================= */

  const sendNewReport = async () => {
    const formData = new FormData();
    formData.append("reporter_name", reporter.trim());
    formData.append("location", location.trim());
    formData.append("description", description.trim());
    if (photoFile) {
      const compressedPhoto = await compressImageForUpload(photoFile);
      formData.append("photo", compressedPhoto, compressedPhoto.name);
    }

    const response = await fetchWithRetry(
      "/api/issues",
      { method: "POST", body: formData },
      15000,
      1
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Závadu sa nepodarilo odoslať.");
    }
    setDuplicateWindowOpen(false);
    setDuplicateCandidates([]);
    setScreen("success");
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reporter.trim() || !location.trim() || !description.trim()) {
      showModal("error", "Chýbajú údaje", "Vyplňte meno, miesto a popis závady.");
      return;
    }
    if (!navigator.onLine) {
      showModal(
        "info",
        "Ste offline",
        "Hlásenie zatiaľ nie je možné odoslať. Fotku môžete vybrať z galérie po opätovnom pripojení."
      );
      return;
    }

    try {
      setReportLoading(true);
      const response = await fetchWithRetry(
        "/api/issues/duplicates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: location.trim(),
            description: description.trim(),
          }),
        },
        10000,
        1
      );
      const data = await response.json();
      const candidates = response.ok && data.success ? data.candidates || [] : [];
      if (candidates.length > 0) {
        setDuplicateCandidates(candidates);
        setDuplicateWindowOpen(true);
        return;
      }
      await sendNewReport();
    } catch (error) {
      console.error(error);
      showModal(
        "error",
        "Závadu sa nepodarilo odoslať",
        error instanceof Error ? error.message : "Skúste to znova."
      );
    } finally {
      setReportLoading(false);
    }
  };

  const mergeDuplicateReport = async (issueId: number) => {
    try {
      setDuplicateSubmitting(true);
      const formData = new FormData();
      formData.append("reporter_name", reporter.trim());
      formData.append("location", location.trim());
      formData.append("description", description.trim());
      if (photoFile) {
        const compressedPhoto = await compressImageForUpload(photoFile);
        formData.append("photo", compressedPhoto, compressedPhoto.name);
      }
      const response = await fetchWithRetry(
        `/api/issues/${issueId}/duplicate-report`,
        { method: "POST", body: formData },
        15000,
        1
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Hlásenie sa nepodarilo pripojiť.");
      }
      setDuplicateWindowOpen(false);
      setDuplicateCandidates([]);
      setScreen("success");
    } catch (error) {
      console.error(error);
      showModal(
        "error",
        "Hlásenie sa nepodarilo pripojiť",
        error instanceof Error ? error.message : "Skúste to znova."
      );
    } finally {
      setDuplicateSubmitting(false);
      setReportLoading(false);
    }
  };

  const resetReport = () => {
    setReporter("");
    setLocation("");
    setDescription("");
    setPhotoFile(null);
    setPhotoName("");
    setDuplicateCandidates([]);
    setDuplicateWindowOpen(false);
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

      setLoginLoadingRole("ÚDRŽBA");
      const ok = await loadIssues();
      if (!ok) {
        setLoginLoadingRole(null);
        return;
      }
      setLoggedMaintenanceName(maintenanceName.trim());
      setMaintenanceFilter("new");
      setScreen("maintenance-dashboard");
      setLoginLoadingRole(null);
      void loadAlerts("maintenance", false);
      window.setTimeout(() => void loadMessages("maintenance"), 0);
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

      setLoginLoadingRole("VEDÚCI ÚDRŽBY");
      const ok = await loadIssues();
      if (!ok) {
        setLoginLoadingRole(null);
        return;
      }
      setLoggedManagerName(managerName.trim());
      setManagerStatusFilter("all");
      setManagerAgeFilter(0);
      setManagerStaleFilter(0);
      setManagerSearch("");
      setScreen("manager-dashboard");
      setLoginLoadingRole(null);
      void loadAlerts("management", true);
      window.setTimeout(() => void loadMessages("manager"), 0);
    };

  const logoutManager = () => {
    setManagerName("");
    setManagerPassword("");
    setLoggedManagerName("");
    setSelectedIssue(null);
    setIssueEvents([]);
    setScreen("home");
  };

  const loginOperations = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!operationsName.trim()) {
      showModal(
        "error",
        "Chýba meno",
        "Pred prihlásením napíšte svoje meno."
      );
      return;
    }

    if (operationsPassword !== "prevadzka1234") {
      showModal(
        "error",
        "Nesprávne heslo",
        "Zadané heslo prevádzkového manažéra nie je správne."
      );
      return;
    }

    setLoginLoadingRole("PREVÁDZKOVÝ MANAŽÉR");
    const ok = await loadIssues();
    if (!ok) {
      setLoginLoadingRole(null);
      return;
    }
    setLoggedOperationsName(operationsName.trim());
    await loadRatings();
    setOperationsStatusFilter("all");
    setOperationsAgeFilter(0);
    setOperationsStaleFilter(0);
    setScreen("operations-dashboard");
    setLoginLoadingRole(null);
    void loadAlerts("management", true);
  };

  const logoutOperations = () => {
    setOperationsName("");
    setOperationsPassword("");
    setLoggedOperationsName("");
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
          const compressedPhoto =
            await compressImageForUpload(
              actionPhoto
            );

          formData.append(
            "photo",
            compressedPhoto,
            compressedPhoto.name
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
        await loadIssueEvents(
          selectedIssue.id
        );

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
          const compressedPhoto =
            await compressImageForUpload(
              managerActionPhoto
            );

          formData.append(
            "photo",
            compressedPhoto,
            compressedPhoto.name
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
        await loadIssueEvents(
          selectedIssue.id
        );

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

        if (
          managerActionMode ===
          "reopen"
        ) {
          showModal(
            "success",
            "Úloha bola znovu otvorená",
            "Úloha sa opäť zobrazí medzi novými úlohami údržby.",
            `Znovu otvoril: ${loggedManagerName}`
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
     AKCIE PREVÁDZKOVÉHO MANAŽÉRA
     ========================================================= */

  const openOperationsAction = (mode: OperationsActionMode) => {
    setOperationsActionComment("");
    setOperationsActionPhoto(null);
    setOperationsActionPhotoName("");
    setOperationsActionMode(mode);
  };

  const closeOperationsAction = () => {
    setOperationsActionMode(null);
    setOperationsActionComment("");
    setOperationsActionPhoto(null);
    setOperationsActionPhotoName("");
  };

  const submitOperationsAction = async () => {
    if (!selectedIssue || !operationsActionMode) return;

    if (!operationsActionComment.trim()) {
      showModal(
        "error",
        "Chýba komentár",
        "Napíšte krátky komentár k rozhodnutiu."
      );
      return;
    }

    try {
      setActionLoading(true);
      const formData = new FormData();
      formData.append("operations_name", loggedOperationsName);
      formData.append("action", operationsActionMode);
      formData.append("message", operationsActionComment.trim());
      if (operationsActionPhoto) {
        const compressedPhoto =
          await compressImageForUpload(
            operationsActionPhoto
          );

        formData.append(
          "photo",
          compressedPhoto,
          compressedPhoto.name
        );
      }

      const response = await fetch(
        `/api/issues/${selectedIssue.id}/operations-action`,
        { method: "POST", body: formData }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        showModal(
          "error",
          "Rozhodnutie sa nepodarilo uložiť",
          data.error || "Skúste to znova."
        );
        return;
      }

      setSelectedIssue(data.issue);
      await Promise.all([
        loadIssues(),
        loadIssueEvents(selectedIssue.id),
      ]);
      closeOperationsAction();
      showModal(
        "success",
        operationsActionMode === "close"
          ? "Závada bola uzavretá"
          : operationsActionMode === "reopen"
          ? "Úloha bola znovu otvorená"
          : "Vrátené vedúcemu údržby",
        operationsActionMode === "close"
          ? "Prevádzkový manažér závadu uzavrel."
          : operationsActionMode === "reopen"
          ? "Úloha sa opäť zobrazí medzi novými úlohami údržby."
          : "Závada bola vrátená vedúcemu údržby na ďalšie riešenie.",
        `Rozhodol: ${loggedOperationsName}`
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

  const submitOperationsTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskLocation.trim() || !taskDescription.trim()) {
      showModal(
        "error",
        "Chýbajú údaje",
        "Vyplňte miesto a popis novej úlohy."
      );
      return;
    }

    try {
      setActionLoading(true);
      const formData = new FormData();
      formData.append("operations_name", loggedOperationsName);
      formData.append("location", taskLocation.trim());
      formData.append("description", taskDescription.trim());
      if (taskPhoto) {
        const compressedPhoto =
          await compressImageForUpload(
            taskPhoto
          );

        formData.append(
          "photo",
          compressedPhoto,
          compressedPhoto.name
        );
      }
      const response = await fetch("/api/operations/tasks", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        showModal(
          "error",
          "Úlohu sa nepodarilo vytvoriť",
          data.error || "Skúste to znova."
        );
        return;
      }
      setTaskLocation("");
      setTaskDescription("");
      setTaskPhoto(null);
      setTaskPhotoName("");
      await loadIssues();
      setScreen("operations-dashboard");
      showModal(
        "success",
        "Úloha bola vytvorená",
        "Nová úloha bola odoslaná vedúcemu údržby.",
        `Vytvoril: ${loggedOperationsName}`
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

  const submitRating = async (
    rating: "up" | "down",
    actorRole: "maintenance_manager" | "operations_manager",
    actorName: string
  ) => {
    if (!selectedIssue) return;
    try {
      setActionLoading(true);
      const response = await fetch(
        `/api/issues/${selectedIssue.id}/rating`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_name: actorName,
            actor_role: actorRole,
            rating,
            message: ratingComment.trim(),
          }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        showModal(
          "error",
          "Hodnotenie sa nepodarilo uložiť",
          data.error || "Skúste to znova."
        );
        return;
      }
      setRatingChoice(rating);
      setRatingComment("");
      await Promise.all([
        loadIssueEvents(selectedIssue.id),
        loadIssues(),
        loadRatings(),
      ]);
      showModal(
        "success",
        rating === "up" ? "Palec hore uložený" : "Palec dole uložený",
        "Spätná väzba k oprave bola uložená.",
        `Hodnotil: ${actorName}`
      );
    } catch (error) {
      console.error(error);
      showModal(
        "error",
        "Nastala chyba",
        "Hodnotenie sa nepodarilo odoslať."
      );
    } finally {
      setActionLoading(false);
    }
  };

  /* =========================================================
     SPRÁVY ÚDRŽBA <-> VEDÚCI
     ========================================================= */

  const submitMaintenanceMessage = async () => {
    if (!loggedMaintenanceName || !messageSubject.trim() || !messageBody.trim()) {
      showModal("error", "Chýbajú údaje", "Vyplňte predmet a text správy.");
      return;
    }
    try {
      setFeatureLoading(true);
      const formData = new FormData();
      formData.append("sender_name", loggedMaintenanceName);
      formData.append("category", messageCategory);
      formData.append("subject", messageSubject.trim());
      formData.append("message", messageBody.trim());
      if (messagePhoto) {
        const compressed = await compressImageForUpload(messagePhoto);
        formData.append("photo", compressed, compressed.name);
      }
      const response = await fetchWithRetry(
        "/api/messages",
        { method: "POST", body: formData },
        15000,
        1
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Správa sa neodoslala.");
      setMessageComposerOpen(false);
      setMessageSubject("");
      setMessageBody("");
      setMessagePhoto(null);
      setMessagePhotoName("");
      await loadMessages("maintenance");
      showModal("success", "Správa odoslaná", "Vedúci údržby ju uvidí vo svojom prehľade.");
    } catch (error) {
      showModal("error", "Správa sa neodoslala", error instanceof Error ? error.message : "Skúste to znova.");
    } finally {
      setFeatureLoading(false);
    }
  };

  const submitMessageReply = async () => {
    if (!selectedMessage || !messageReplyText.trim()) return;
    const actorRole = messagesPanelRole === "manager" ? "maintenance_manager" : "maintenance";
    const actorName = messagesPanelRole === "manager" ? loggedManagerName : loggedMaintenanceName;
    try {
      setFeatureLoading(true);
      const formData = new FormData();
      formData.append("actor_role", actorRole);
      formData.append("actor_name", actorName);
      formData.append("message", messageReplyText.trim());
      if (messageReplyPhoto) {
        const compressed = await compressImageForUpload(messageReplyPhoto);
        formData.append("photo", compressed, compressed.name);
      }
      const response = await fetchWithRetry(
        `/api/messages/${selectedMessage.id}/reply`,
        { method: "POST", body: formData },
        15000,
        1
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Odpoveď sa neodoslala.");
      setMessageReplyText("");
      setMessageReplyPhoto(null);
      setMessageReplyPhotoName("");
      await loadMessageReplies(selectedMessage.id);
      if (messagesPanelRole) await loadMessages(messagesPanelRole);
    } catch (error) {
      showModal("error", "Odpoveď sa neodoslala", error instanceof Error ? error.message : "Skúste to znova.");
    } finally {
      setFeatureLoading(false);
    }
  };

  const resolveMessage = async () => {
    if (!selectedMessage) return;
    try {
      setFeatureLoading(true);
      const response = await fetchWithRetry(
        `/api/messages/${selectedMessage.id}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manager_name: loggedManagerName }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Správa sa neuzavrela.");
      setSelectedMessage(null);
      await loadMessages("manager");
    } catch (error) {
      showModal("error", "Správa sa neuzavrela", error instanceof Error ? error.message : "Skúste to znova.");
    } finally {
      setFeatureLoading(false);
    }
  };

  const convertMessageToTask = async () => {
    if (!selectedMessage) return;
    try {
      setFeatureLoading(true);
      const response = await fetchWithRetry(
        `/api/messages/${selectedMessage.id}/create-task`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manager_name: loggedManagerName }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Úloha sa nevytvorila.");
      setSelectedMessage(null);
      await Promise.all([loadMessages("manager"), loadIssues()]);
      showModal("success", "Úloha vytvorená", `Zo správy vznikla závada #${String(data.issue_id).padStart(4, "0")}.`);
    } catch (error) {
      showModal("error", "Úloha sa nevytvorila", error instanceof Error ? error.message : "Skúste to znova.");
    } finally {
      setFeatureLoading(false);
    }
  };

  /* =========================================================
     UPOZORNENIA A ODSTÁVKY
     ========================================================= */

  const alertTypeInfo: Record<AlertType, { label: string; icon: string }> = {
    critical: { label: "Kritické upozornenie", icon: "⚠" },
    outage: { label: "Odstávka", icon: "▲" },
    planned: { label: "Plánovaná práca", icon: "!" },
    info: { label: "Prevádzková informácia", icon: "i" },
  };

  const alertStatus = (alert: AlertItem) => {
    const today = localDateString();
    if (alert.start_date > today) return "scheduled";
    if (alert.end_date < today) return "expired";
    return "active";
  };

  const toggleAlertAudience = (audience: string) => {
    setAlertAudiences((current) =>
      current.includes(audience)
        ? current.filter((item) => item !== audience)
        : [...current, audience]
    );
  };

  const selectAlertDate = (value: string) => {
    if (!alertStartDate || (alertStartDate && alertEndDate && alertStartDate !== alertEndDate)) {
      setAlertStartDate(value);
      setAlertEndDate(value);
      return;
    }
    if (value < alertStartDate) {
      setAlertEndDate(alertStartDate);
      setAlertStartDate(value);
    } else {
      setAlertEndDate(value);
    }
  };

  const openAlertEditor = () => {
    setAlertType("critical");
    setAlertTitle("");
    setAlertLocation("");
    setAlertDescription("");
    setAlertStartDate("");
    setAlertEndDate("");
    setAlertAudiences(["public", "maintenance", "management"]);
    setAlertPhoto(null);
    setAlertPhotoName("");
    setAlertSubmitError("");
    setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setAlertEditorOpen(true);
  };

  const submitAlert = async () => {
    if (featureLoading) return;

    const creatorName = loggedOperationsName || loggedManagerName;
    const creatorRole = loggedOperationsName ? "operations_manager" : "maintenance_manager";

    setAlertSubmitError("");

    if (!creatorName) {
      const message = "Prihlásenie už nie je aktívne. Zatvorte okno a prihláste sa znova.";
      setAlertSubmitError(message);
      showModal("error", "Chýba prihlásenie", message);
      return;
    }

    if (!alertStartDate || !alertEndDate) {
      const message = "Vyberte termín upozornenia.";
      setAlertSubmitError(message);
      showModal("error", "Chýba termín", message);
      return;
    }

    if (!alertTitle.trim() && !alertDescription.trim()) {
      const message = "Vyplňte aspoň názov alebo popis upozornenia.";
      setAlertSubmitError(message);
      showModal("error", "Chýba text upozornenia", message);
      return;
    }

    if (alertAudiences.length === 0) {
      const message = "Upozornenie musí byť zobrazené aspoň jednej skupine.";
      setAlertSubmitError(message);
      showModal("error", "Vyberte príjemcov", message);
      return;
    }

    try {
      setFeatureLoading(true);

      const formData = new FormData();
      formData.append("alert_type", alertType);
      formData.append("title", alertTitle.trim());
      formData.append("location", alertLocation.trim());
      formData.append("description", alertDescription.trim());
      formData.append("start_date", alertStartDate);
      formData.append("end_date", alertEndDate);
      formData.append("audiences", alertAudiences.join(","));
      formData.append("created_by_role", creatorRole);
      formData.append("created_by_name", creatorName);

      if (alertPhoto) {
        const compressed = await compressImageForUpload(alertPhoto);
        formData.append("photo", compressed, compressed.name);
      }

      const response = await fetchWithRetry(
        "/api/alerts",
        { method: "POST", body: formData },
        15000,
        1
      );

      const raw = await response.text();
      let data: { success?: boolean; error?: string; alert_id?: number } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Server vrátil nečakanú odpoveď (${response.status}).`);
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Upozornenie sa neuložilo (${response.status}).`);
      }

      setAlertSubmitError("");
      setAlertEditorOpen(false);

      await Promise.all([
        loadAlerts(alertsAudience, true),
        loadAlerts("public", false),
      ]);

      showModal(
        "success",
        "Upozornenie publikované",
        "Zobrazí sa vybraným skupinám počas zvoleného termínu.",
        data.alert_id ? `Číslo upozornenia: ${data.alert_id}` : undefined
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Skúste to znova.";
      setAlertSubmitError(message);
      showModal("error", "Upozornenie sa neuložilo", message);
    } finally {
      setFeatureLoading(false);
    }
  };

  const archiveAlert = async (alertId: number) => {
    try {
      setFeatureLoading(true);
      const response = await fetchWithRetry(`/api/alerts/${alertId}/archive`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Upozornenie sa neukončilo.");
      await Promise.all([
        loadAlerts(alertsAudience, true),
        loadAlerts("public", false),
      ]);
    } catch (error) {
      showModal("error", "Upozornenie sa neukončilo", error instanceof Error ? error.message : "Skúste to znova.");
    } finally {
      setFeatureLoading(false);
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

  const parseDate = (dateValue: string | null) => {
    if (!dateValue) return null;
    let normalized = dateValue;
    if (!normalized.includes("T")) normalized = normalized.replace(" ", "T");
    if (!normalized.endsWith("Z") && !normalized.includes("+")) normalized += "Z";
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const daysSince = (dateValue: string | null) => {
    const date = parseDate(dateValue);
    if (!date) return 0;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  };

  const matchesIssueSearch = (issue: Issue, value: string) => {
    const q = value.trim().toLocaleLowerCase("sk-SK");
    if (!q) return true;
    const haystack = [
      issue.description,
      issue.location,
      issue.reporter_name,
      issue.current_worker_name || "",
      issue.last_actor_name || "",
      issue.event_text || "",
      String(issue.id),
    ]
      .join(" ")
      .toLocaleLowerCase("sk-SK");
    return haystack.includes(q);
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

      case "returned_to_manager":
        return "Vrátené vedúcemu údržby";

      case "operations_resolved":
        return "Uzavreté prevádzkovým manažérom";

      case "operations_task_created":
        return "Nová úloha od prevádzkového manažéra";

      case "reopened_by_manager":
        return "Znovu otvorené vedúcim";

      case "reopened_by_operations":
        return "Znovu otvorené prevádzkovým manažérom";

      case "duplicate_report":
        return "Ďalšie hlásenie rovnakej závady";

      case "message_converted_to_task":
        return "Úloha vytvorená zo správy údržby";

      case "rating_up":
        return "Palec hore";

      case "rating_down":
        return "Palec dole";

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
      case "operations_task_created":
      case "message_converted_to_task":
        return "➡️";

      case "duplicate_report":
        return "👥";

      case "returned_to_maintenance":
      case "returned_to_manager":
      case "reopened_by_manager":
      case "reopened_by_operations":
        return "↩️";

      case "operations_resolved":
        return "✅";

      case "rating_up":
        return "👍";

      case "rating_down":
        return "👎";

      default:
        return "•";
    }
  };

  const getMaintenanceWorkerFromEvents = (
    events: IssueEvent[]
  ) => {
    const preferred =
      events.find(
        (event) =>
          event.actor_role ===
            "maintenance" &&
          [
            "resolved",
            "escalated_to_manager",
            "material_requested",
          ].includes(
            event.event_type
          ) &&
          Boolean(
            event.actor_name
          )
      );

    if (preferred?.actor_name) {
      return preferred.actor_name;
    }

    const taken =
      events.find(
        (event) =>
          event.actor_role ===
            "maintenance" &&
          event.event_type ===
            "taken" &&
          Boolean(
            event.actor_name
          )
      );

    return (
      taken?.actor_name ||
      selectedIssue
        ?.current_worker_name ||
      null
    );
  };

  const renderCommunicationSection = (
    events: IssueEvent[]
  ) => (
    <div className="issue-communication-section">
      <div className="issue-actions-title">
        KOMUNIKÁCIA K ZÁVADE
      </div>

      {historyLoading ? (
        <div className="communication-empty">
          Načítavam komunikáciu...
        </div>
      ) : events.length === 0 ? (
        <div className="communication-empty">
          K tejto závade zatiaľ nie je žiadny odovzdaný komentár.
        </div>
      ) : (
        <div className="communication-list">
          {events.map((event) => (
            <div
              className="communication-card"
              key={event.id}
            >
              <div className="communication-card-head">
                <div className="communication-card-title">
                  <span className="communication-card-icon">
                    {eventIcon(
                      event.event_type
                    )}
                  </span>

                  <div>
                    <strong>
                      {eventLabel(
                        event.event_type
                      )}
                    </strong>

                    {event.actor_name && (
                      <small>
                        {event.actor_name}
                      </small>
                    )}
                  </div>
                </div>

                <span className="communication-date">
                  {formatDate(
                    event.created_at
                  )}
                </span>
              </div>

              {event.message && (
                <p className="communication-message">
                  {event.message}
                </p>
              )}

              {event.photo_key && (
                <img
                  src={getPhotoUrl(
                    event.photo_key
                  )}
                  alt="Fotografia ku komentáru"
                  className="communication-photo"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

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
     PREHĽAD VEDÚCEHO ÚDRŽBY
     ========================================================= */

  const operationsCount =
    issues.filter(
      (issue) =>
        issue.status ===
        "operations"
    ).length;

  const closedCount =
    closedIssues.length;

  const managerDecisionIssues = issues.filter(
    (issue) =>
      issue.status === "manager" ||
      issue.status === "material"
  );

  const managerFilteredIssues = issues.filter((issue) => {
    if (
      managerStatusFilter !== "all" &&
      issue.status !== managerStatusFilter
    ) return false;
    if (!matchesIssueSearch(issue, managerSearch)) return false;
    if (managerAgeFilter > 0 && daysSince(issue.created_at) < managerAgeFilter) return false;
    if (managerStaleFilter > 0 && daysSince(issue.updated_at) < managerStaleFilter) return false;
    return true;
  });

  /* =========================================================
     PREHĽAD PREVÁDZKOVÉHO MANAŽÉRA
     ========================================================= */

  const openIssues = issues.filter((issue) => issue.status !== "closed");
  const operationsDecisionIssues = issues.filter(
    (issue) => issue.status === "operations"
  );

  const operationsFilteredIssues = issues.filter((issue) => {
    if (
      operationsStatusFilter !== "all" &&
      issue.status !== operationsStatusFilter
    ) return false;
    if (!matchesIssueSearch(issue, operationsSearch)) return false;
    if (operationsAgeFilter > 0 && daysSince(issue.created_at) < operationsAgeFilter) return false;
    if (operationsStaleFilter > 0 && daysSince(issue.updated_at) < operationsStaleFilter) return false;
    return true;
  });

  const averageResolutionDays = (() => {
    const values = closedIssues
      .map((issue) => {
        const start = parseDate(issue.created_at);
        const end = parseDate(issue.closed_at);
        if (!start || !end) return null;
        return Math.max(0, (end.getTime() - start.getTime()) / 86400000);
      })
      .filter((value): value is number => value !== null);
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  })();

  const locationStats = Object.entries(
    issues.reduce<Record<string, number>>((acc, issue) => {
      const key = issue.location || "Neurčené";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const currentMonthRatings = ratings.filter((rating) => {
    const date = parseDate(rating.created_at);
    if (!date) return false;
    const now = new Date();
    return (
      date.getUTCFullYear() === now.getUTCFullYear() &&
      date.getUTCMonth() === now.getUTCMonth()
    );
  });

  const employeeRatingStats = Object.values(
    currentMonthRatings.reduce<
      Record<string, { name: string; up: number; down: number }>
    >((acc, rating) => {
      const issue = issues.find((item) => item.id === rating.issue_id);
      const worker =
        rating.rated_worker_name ||
        issue?.current_worker_name;
      if (!worker) return acc;
      if (!acc[worker]) acc[worker] = { name: worker, up: 0, down: 0 };
      if (rating.event_type === "rating_up") acc[worker].up += 1;
      if (rating.event_type === "rating_down") acc[worker].down += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.up + b.down - (a.up + a.down));

  const managerBottomNav = (
    active: "overview" | "decision" | "history" | "statistics"
  ) => (
    <div className="operations-bottom-menu">
      <button
        className={active === "overview" ? "bottom-menu-active" : ""}
        onClick={() => setScreen("manager-dashboard")}
      >
        <span>▦</span>
        Prehľad
      </button>
      <button
        className={active === "decision" ? "bottom-menu-active" : ""}
        onClick={() => setScreen("manager-decision")}
      >
        <span>⚠️</span>
        Na rozhodnutie
      </button>
      <button
        className={active === "history" ? "bottom-menu-active" : ""}
        onClick={() => setScreen("manager-history")}
      >
        <span>📋</span>
        História
      </button>
      <button
        className={active === "statistics" ? "bottom-menu-active" : ""}
        onClick={() => {
          loadRatings();
          setScreen("manager-statistics");
        }}
      >
        <span>📊</span>
        Štatistika
      </button>
    </div>
  );

  const operationsBottomNav = (
    active: "overview" | "decision" | "history" | "statistics"
  ) => (
    <div className="operations-bottom-menu">
      <button
        className={active === "overview" ? "bottom-menu-active" : ""}
        onClick={() => setScreen("operations-dashboard")}
      >
        <span>▦</span>
        Prehľad
      </button>
      <button
        className={active === "decision" ? "bottom-menu-active" : ""}
        onClick={() => setScreen("operations-decision")}
      >
        <span>⚠️</span>
        Na rozhodnutie
      </button>
      <button
        className={active === "history" ? "bottom-menu-active" : ""}
        onClick={() => setScreen("operations-history")}
      >
        <span>📋</span>
        História
      </button>
      <button
        className={active === "statistics" ? "bottom-menu-active" : ""}
        onClick={() => {
          loadRatings();
          setScreen("operations-statistics");
        }}
      >
        <span>📊</span>
        Štatistika
      </button>
    </div>
  );

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

          <PhotoChoice
            title={maintenanceActionMode === "resolve" ? "Fotografia po oprave" : "Priložiť fotografiu"}
            fileName={actionPhotoName}
            onFile={(file) => {
              setActionPhoto(file);
              setActionPhotoName(file?.name || "");
            }}
          />

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
            {managerActionMode === "return"
              ? "↩️"
              : managerActionMode === "close"
              ? "✅"
              : managerActionMode === "reopen"
              ? "🔄"
              : "⬆️"}
          </div>

          <h2>
            {managerActionMode === "return"
              ? "Vrátiť údržbe"
              : managerActionMode === "close"
              ? "Uzavrieť úlohu"
              : managerActionMode === "reopen"
              ? "Znovu otvoriť úlohu"
              : "Posunúť prevádzkovému manažérovi"}
          </h2>

          <p>
            {managerActionMode === "return"
              ? "Závada sa opäť objaví medzi novými závadami a môže ju prevziať údržbár."
              : managerActionMode === "close"
              ? "Úlohu môžete uzavrieť v ktoromkoľvek stave. Napíšte dôvod, napríklad nebude sa realizovať, riešené iným spôsobom alebo oprava je ukončená."
              : managerActionMode === "reopen"
              ? "Uzavretá úloha sa znovu otvorí ako nová a bude ju môcť prevziať údržba. Pôvodná história zostane zachovaná."
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
                managerActionMode === "return"
                  ? "Čo má údržba ešte vykonať?"
                  : managerActionMode === "close"
                  ? "Dôvod uzavretia, napr. nebude sa realizovať..."
                  : managerActionMode === "reopen"
                  ? "Prečo sa má úloha znovu otvoriť?"
                  : "Prečo je potrebné rozhodnutie prevádzkového manažéra?"
              }
            />
          </label>

          <PhotoChoice
            title="Priložiť fotografiu"
            fileName={managerActionPhotoName}
            onFile={(file) => {
              setManagerActionPhoto(file);
              setManagerActionPhotoName(file?.name || "");
            }}
          />

          <button
            className="action-confirm-button"
            onClick={
              submitManagerAction
            }
            disabled={actionLoading}
          >
            {actionLoading
              ? "Ukladám..."
              : managerActionMode === "return"
              ? "↩️ Vrátiť údržbe"
              : managerActionMode === "close"
              ? "✅ Uzavrieť úlohu"
              : managerActionMode === "reopen"
              ? "🔄 Znovu otvoriť úlohu"
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

  const operationsActionWindow = operationsActionMode ? (
    <div className="action-overlay">
      <div className="action-dialog manager-action-dialog">
        <div className="action-handle"></div>
        <div className="manager-dialog-role">PREVÁDZKOVÝ MANAŽÉR</div>
        <div className="action-dialog-icon">
          {operationsActionMode === "close" ? "✅" : operationsActionMode === "reopen" ? "🔄" : "↩️"}
        </div>
        <h2>
          {operationsActionMode === "close"
            ? "Uzavrieť úlohu"
            : operationsActionMode === "reopen"
            ? "Znovu otvoriť úlohu"
            : "Vrátiť vedúcemu údržby"}
        </h2>
        <p>
          {operationsActionMode === "close"
            ? "Úlohu môžete uzavrieť v ktoromkoľvek stave. Napíšte dôvod rozhodnutia."
            : operationsActionMode === "reopen"
            ? "Uzavretá úloha sa znovu otvorí ako nová a vráti sa údržbe. Pôvodná história zostane zachovaná."
            : "Napíšte, čo má vedúci údržby doplniť alebo zabezpečiť."}
        </p>
        <label className="action-label">
          Komentár
          <textarea
            value={operationsActionComment}
            onChange={(e) => setOperationsActionComment(e.target.value)}
            rows={4}
            placeholder="Napíšte komentár..."
          />
        </label>
        <PhotoChoice
          title="Priložiť fotografiu"
          fileName={operationsActionPhotoName}
          onFile={(file) => {
            setOperationsActionPhoto(file);
            setOperationsActionPhotoName(file?.name || "");
          }}
        />
        <button
          className="action-confirm-button"
          onClick={submitOperationsAction}
          disabled={actionLoading}
        >
          {actionLoading
            ? "Ukladám..."
            : operationsActionMode === "close"
            ? "✅ Uzavrieť úlohu"
            : operationsActionMode === "reopen"
            ? "🔄 Znovu otvoriť úlohu"
            : "↩️ Vrátiť vedúcemu"}
        </button>
        <button
          className="action-cancel-button"
          onClick={closeOperationsAction}
          disabled={actionLoading}
        >
          Zrušiť
        </button>
      </div>
    </div>
  ) : null;

  const duplicateWindow = duplicateWindowOpen ? (
    <div className="action-overlay feature-overlay">
      <div className="feature-dialog duplicate-dialog">
        <div className="feature-dialog-head">
          <div>
            <small>KONTROLA DUPLICITY</small>
            <h2>Možno je táto závada už nahlásená</h2>
          </div>
          <button onClick={() => setDuplicateWindowOpen(false)}>×</button>
        </div>
        <p className="feature-intro">
          Porovnali sme miesto a kľúčové slová popisu. Pozrite si podobné otvorené závady.
        </p>
        <div className="duplicate-list">
          {duplicateCandidates.map((candidate) => (
            <div className="duplicate-card" key={candidate.id}>
              {candidate.photo_key && (
                <img src={getPhotoUrl(candidate.photo_key)} alt="Podobná závada" />
              )}
              <div className="duplicate-card-body">
                <div className="duplicate-card-top">
                  <strong>#{String(candidate.id).padStart(4, "0")}</strong>
                  <span>{Math.round(candidate.score * 100)} % zhoda</span>
                </div>
                <h3>{candidate.description}</h3>
                <p>📍 {candidate.location}</p>
                <small>{statusLabel(candidate.status)} • {formatDate(candidate.created_at)}</small>
              </div>
              <button
                className="duplicate-merge-button"
                disabled={duplicateSubmitting}
                onClick={() => mergeDuplicateReport(candidate.id)}
              >
                Áno, je to tá istá
              </button>
            </div>
          ))}
        </div>
        <button
          className="duplicate-new-button"
          disabled={duplicateSubmitting}
          onClick={async () => {
            try {
              setDuplicateSubmitting(true);
              await sendNewReport();
            } catch (error) {
              showModal("error", "Závadu sa nepodarilo odoslať", error instanceof Error ? error.message : "Skúste to znova.");
            } finally {
              setDuplicateSubmitting(false);
              setReportLoading(false);
            }
          }}
        >
          Nie, je to iná závada – vytvoriť novú
        </button>
      </div>
    </div>
  ) : null;

  const messagesWindow = messagesPanelRole ? (
    <div className="action-overlay feature-overlay">
      <div className="feature-dialog messages-dialog">
        <div className="feature-dialog-head">
          <div>
            <small>INTERNÁ KOMUNIKÁCIA</small>
            <h2>{messagesPanelRole === "manager" ? "Správy od údržby" : "Správy vedúcemu"}</h2>
          </div>
          <button onClick={() => { setMessagesPanelRole(null); setSelectedMessage(null); }}>×</button>
        </div>

        {selectedMessage ? (
          <div className="message-detail">
            <button className="feature-back" onClick={() => { setSelectedMessage(null); setMessageReplies([]); }}>← Späť na správy</button>
            <div className="message-original-card">
              <div className="message-meta-row">
                <span className={`message-category category-${selectedMessage.category}`}>{selectedMessage.category}</span>
                <span className={`message-status status-${selectedMessage.status}`}>{selectedMessage.status === "open" ? "Otvorená" : selectedMessage.status === "converted" ? "Vytvorená úloha" : "Vybavená"}</span>
              </div>
              <h3>{selectedMessage.subject}</h3>
              <p>{selectedMessage.message}</p>
              <small>👤 {selectedMessage.sender_name} • {formatDate(selectedMessage.created_at)}</small>
              {selectedMessage.photo_key && <img src={getPhotoUrl(selectedMessage.photo_key)} alt="Fotografia správy" className="message-photo" />}
            </div>

            <div className="message-thread">
              {messageReplies.map((reply) => (
                <div className={`message-reply ${reply.actor_role === "maintenance_manager" ? "reply-manager" : "reply-maintenance"}`} key={reply.id}>
                  <div className="message-reply-head"><strong>{reply.actor_name}</strong><span>{formatDate(reply.created_at)}</span></div>
                  <p>{reply.message}</p>
                  {reply.photo_key && <img src={getPhotoUrl(reply.photo_key)} alt="Fotografia odpovede" />}
                </div>
              ))}
            </div>

            {selectedMessage.status === "open" && (
              <div className="message-reply-box">
                <textarea
                  rows={3}
                  placeholder="Napísať odpoveď..."
                  value={messageReplyText}
                  onChange={(e) => setMessageReplyText(e.target.value)}
                />
                <PhotoChoice
                  title="Fotografia k odpovedi"
                  fileName={messageReplyPhotoName}
                  onFile={(file) => { setMessageReplyPhoto(file); setMessageReplyPhotoName(file?.name || ""); }}
                />
                <button className="submit-button" disabled={featureLoading || !messageReplyText.trim()} onClick={submitMessageReply}>
                  Odoslať odpoveď
                </button>
              </div>
            )}

            {messagesPanelRole === "manager" && selectedMessage.status === "open" && (
              <div className="message-manager-actions">
                <button className="message-task-button" onClick={convertMessageToTask} disabled={featureLoading}>＋ Vytvoriť z toho úlohu</button>
                <button className="message-resolve-button" onClick={resolveMessage} disabled={featureLoading}>✓ Označiť ako vybavené</button>
              </div>
            )}
          </div>
        ) : messageComposerOpen ? (
          <div className="message-composer">
            <button className="feature-back" onClick={() => setMessageComposerOpen(false)}>← Späť</button>
            <label>
              Typ správy
              <select value={messageCategory} onChange={(e) => setMessageCategory(e.target.value)}>
                <option value="nakup">Nákup / materiál</option>
                <option value="rozpis">Chýba v rozpise</option>
                <option value="organizacia">Organizačné</option>
                <option value="ine">Iné</option>
              </select>
            </label>
            <label>
              Predmet
              <input value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)} placeholder="Napr. Potrebujeme nový ventil" />
            </label>
            <label>
              Správa
              <textarea rows={5} value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Napíšte, čo potrebujete zabezpečiť..." />
            </label>
            <PhotoChoice title="Priložiť fotografiu" fileName={messagePhotoName} onFile={(file) => { setMessagePhoto(file); setMessagePhotoName(file?.name || ""); }} />
            <button className="submit-button" onClick={submitMaintenanceMessage} disabled={featureLoading}>Odoslať vedúcemu</button>
          </div>
        ) : (
          <>
            {messagesPanelRole === "maintenance" && (
              <button className="feature-primary-button" onClick={() => setMessageComposerOpen(true)}>＋ Nová správa vedúcemu</button>
            )}
            <div className="messages-list">
              {messagesLoading ? (
                <div className="loading-box">Načítavam správy...</div>
              ) : messages.length === 0 ? (
                <div className="empty-box">Zatiaľ tu nie sú žiadne správy.</div>
              ) : messages.map((message) => (
                <button
                  className="message-list-card"
                  key={message.id}
                  onClick={async () => {
                    setSelectedMessage(message);
                    await loadMessageReplies(message.id);
                  }}
                >
                  <div>
                    <div className="message-meta-row">
                      <span className={`message-category category-${message.category}`}>{message.category}</span>
                      <span className={`message-status status-${message.status}`}>{message.status === "open" ? "Otvorená" : message.status === "converted" ? "Úloha" : "Vybavená"}</span>
                    </div>
                    <strong>{message.subject}</strong>
                    <p>{message.message}</p>
                    <small>👤 {message.sender_name} • 💬 {message.reply_count || 0} • {formatDate(message.updated_at)}</small>
                  </div>
                  <span>›</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  const alertCalendar = (
    <div className="range-calendar">
      <div className="calendar-head">
        <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button>
        <strong>{calendarMonth.toLocaleDateString("sk-SK", { month: "long", year: "numeric" })}</strong>
        <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="calendar-weekdays">{["Po", "Ut", "St", "Št", "Pi", "So", "Ne"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">
        {calendarCells(calendarMonth).map(({ date, inMonth }) => {
          const value = localDateString(date);
          const inRange = alertStartDate && alertEndDate && value >= alertStartDate && value <= alertEndDate;
          const endpoint = value === alertStartDate || value === alertEndDate;
          return (
            <button
              key={value}
              className={`${inMonth ? "" : "calendar-outside"} ${inRange ? "calendar-in-range" : ""} ${endpoint ? "calendar-endpoint" : ""}`}
              onClick={() => selectAlertDate(value)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      <div className="calendar-selection">
        <span>Od: <strong>{alertStartDate || "—"}</strong></span>
        <span>Do: <strong>{alertEndDate || "—"}</strong></span>
      </div>
      <div className="calendar-actions">
        <button onClick={() => { setAlertStartDate(localDateString()); setAlertEndDate(localDateString()); }}>Dnes</button>
        <button onClick={() => { setAlertStartDate(""); setAlertEndDate(""); }}>Vymazať termín</button>
      </div>
    </div>
  );

  const alertsWindow = alertsPanelOpen ? (
    <div className="action-overlay feature-overlay">
      <div className="feature-dialog alerts-dialog">
        <div className="feature-dialog-head">
          <div>
            <small>AREÁL TATRALANDIA</small>
            <h2>Upozornenia a odstávky</h2>
          </div>
          <button onClick={() => { setAlertsPanelOpen(false); setAlertEditorOpen(false); }}>×</button>
        </div>

        {alertEditorOpen ? (
          <div className="alert-editor">
            <button className="feature-back" onClick={() => setAlertEditorOpen(false)}>← Späť na upozornenia</button>
            <label>
              Typ upozornenia
              <select value={alertType} onChange={(e) => setAlertType(e.target.value as AlertType)}>
                <option value="critical">🔴 Kritické upozornenie</option>
                <option value="outage">🟠 Odstávka</option>
                <option value="planned">🟡 Plánovaná práca</option>
                <option value="info">🔵 Prevádzková informácia</option>
              </select>
            </label>
            <label>Názov upozornenia <small>(voliteľné, ak vyplníte popis)</small><input value={alertTitle} onChange={(e) => setAlertTitle(e.target.value)} placeholder="Napr. Odstávka vody" /></label>
            <label>Miesto <small>(voliteľné)</small><input value={alertLocation} onChange={(e) => setAlertLocation(e.target.value)} placeholder="Napr. Wellness zóna" /></label>
            <label>Popis <small>(voliteľné, ak vyplníte názov)</small><textarea rows={4} value={alertDescription} onChange={(e) => setAlertDescription(e.target.value)} placeholder="Sem napíšte aj čas, napr. 22:00 – 24:00..." /></label>
            <div className="alert-term-title">Termín</div>
            {alertCalendar}
            <div className="audience-title">Zobraziť komu</div>
            <div className="audience-chips">
              {[
                ["public", "Nahlasovateľom"],
                ["maintenance", "Údržbe"],
                ["management", "Vedúcim"],
              ].map(([value, label]) => (
                <button key={value} className={alertAudiences.includes(value) ? "audience-active" : ""} onClick={() => toggleAlertAudience(value)}>{label}</button>
              ))}
            </div>
            <PhotoChoice title="Voliteľná fotografia" fileName={alertPhotoName} onFile={(file) => { setAlertPhoto(file); setAlertPhotoName(file?.name || ""); }} />
            {alertSubmitError && (
              <div className="alert-submit-error" role="alert">
                <strong>⚠ Upozornenie sa zatiaľ neodoslalo</strong>
                <span>{alertSubmitError}</span>
              </div>
            )}
            <button
              type="button"
              className="submit-button alert-submit-button"
              onClick={submitAlert}
              disabled={featureLoading}
            >
              {featureLoading ? "Publikujem..." : "📣 Publikovať upozornenie"}
            </button>
          </div>
        ) : (
          <>
            {(loggedManagerName || loggedOperationsName) && (
              <button className="feature-primary-button" onClick={openAlertEditor}>＋ Nové upozornenie</button>
            )}
            <div className="alerts-list">
              {alerts.length === 0 ? (
                <div className="empty-box">Momentálne nie sú žiadne upozornenia.</div>
              ) : alerts.map((alert) => {
                const info = alertTypeInfo[alert.alert_type];
                const status = alertStatus(alert);
                return (
                  <div className={`alert-card alert-${alert.alert_type}`} key={alert.id}>
                    <div className="alert-icon">{info.icon}</div>
                    <div className="alert-card-body">
                      <div className="alert-card-top"><strong>{info.label}</strong><span className={`alert-status alert-status-${status}`}>{status === "active" ? "Aktívne" : status === "scheduled" ? "Naplánované" : "Ukončené"}</span></div>
                      <h3>{alert.title || alert.description || alertTypeInfo[alert.alert_type].label}</h3>
                      {alert.location && <p className="alert-location">📍 {alert.location}</p>}
                      {alert.description && alert.description !== alert.title && <p>{alert.description}</p>}
                      <small>📅 {alert.start_date === alert.end_date ? alert.start_date : `${alert.start_date} – ${alert.end_date}`}</small>
                      {alert.photo_key && <img src={getPhotoUrl(alert.photo_key)} alt="Upozornenie" />}
                      {(loggedManagerName || loggedOperationsName) && status !== "expired" && (
                        <button className="alert-archive" onClick={() => archiveAlert(alert.id)}>Ukončiť upozornenie</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  const loginLoadingWindow = loginLoadingRole ? (
    <div className="action-overlay feature-overlay loading-overlay">
      <div className="login-loading-card">
        <div className="loading-spinner" />
        <strong>Prihlasujem</strong>
        <span>{loginLoadingRole} • načítavam aktuálne dáta…</span>
        <small>Ak je pripojenie slabé, môže to chvíľu trvať.</small>
      </div>
    </div>
  ) : null;

  const offlineWindow = !isOnline ? (
    <div className="offline-banner">● Ste offline – zmeny nie je možné odoslať</div>
  ) : null;

  const globalWindows = (
    <>
      {duplicateWindow}
      {messagesWindow}
      {alertsWindow}
      {modalWindow}
      {loginLoadingWindow}
      {offlineWindow}
    </>
  );

  /* =========================================================
     ZDIEĽANÁ HISTÓRIA DETAIL
     ========================================================= */

  const renderHistoryDetail = (
    returnScreen:
      | "maintenance-history"
      | "manager-history"
      | "operations-history",
    titleRole:
      | "ÚDRŽBA"
      | "VEDÚCI ÚDRŽBY"
      | "PREVÁDZKOVÝ MANAŽÉR"
  ) => {
    if (!selectedIssue) return null;

    const ratedWorkerName =
      getMaintenanceWorkerFromEvents(
        issueEvents
      );

    const issueRatings =
      issueEvents.filter(
        (event) =>
          [
            "rating_up",
            "rating_down",
          ].includes(
            event.event_type
          )
      );

    const latestRating =
      issueRatings[0];

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

            {selectedIssue.status === "closed" && (
              <div className="repair-rating-panel">
                <div className="issue-actions-title">
                  HODNOTENIE OPRAVY
                </div>

                <div className={`rating-status-badge ${
                  latestRating?.event_type === "rating_up"
                    ? "rating-status-up"
                    : latestRating?.event_type === "rating_down"
                    ? "rating-status-down"
                    : "rating-status-empty"
                }`}>
                  {latestRating?.event_type === "rating_up"
                    ? "👍 Pozitívne hodnotenie"
                    : latestRating?.event_type === "rating_down"
                    ? "👎 Negatívne hodnotenie"
                    : "○ Nehodnotené"}
                </div>

                {issueRatings.length > 0 ? (
                  <div className="rating-given-list">
                    {issueRatings
                      .map((event) => (
                        <div className="rating-given-item" key={event.id}>
                          <span className={event.event_type === "rating_up" ? "rating-thumb-up" : "rating-thumb-down"}>
                            {event.event_type === "rating_up" ? "👍" : "👎"}
                          </span>
                          <div>
                            <strong>{event.actor_name || "Hodnotiteľ"}</strong>
                            <small>{formatDate(event.created_at)}</small>
                            {event.message && <p>{event.message}</p>}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="communication-empty">
                    Oprava zatiaľ nebola hodnotená.
                  </div>
                )}

                {titleRole !== "ÚDRŽBA" && ratedWorkerName && (
                  <div className="rating-entry-box">
                    <div className="rating-worker-line">
                      Hodnotený údržbár: <strong>{ratedWorkerName}</strong>
                    </div>
                    <div className="rating-choice-row">
                      <button
                        className={`rating-choice-button rating-up ${ratingChoice === "up" ? "rating-choice-active" : ""}`}
                        onClick={() => setRatingChoice("up")}
                      >
                        👍 Palec hore
                      </button>
                      <button
                        className={`rating-choice-button rating-down ${ratingChoice === "down" ? "rating-choice-active" : ""}`}
                        onClick={() => setRatingChoice("down")}
                      >
                        👎 Palec dole
                      </button>
                    </div>
                    <textarea
                      className="rating-comment"
                      value={ratingComment}
                      onChange={(e) => setRatingComment(e.target.value)}
                      placeholder="Voliteľný komentár k hodnoteniu..."
                      rows={3}
                    />
                    <button
                      className="rating-save-button"
                      disabled={!ratingChoice || actionLoading}
                      onClick={() => {
                        if (!ratingChoice) return;
                        if (titleRole === "VEDÚCI ÚDRŽBY") {
                          submitRating(
                            ratingChoice,
                            "maintenance_manager",
                            loggedManagerName
                          );
                        } else {
                          submitRating(
                            ratingChoice,
                            "operations_manager",
                            loggedOperationsName
                          );
                        }
                      }}
                    >
                      {actionLoading ? "Ukladám..." : "Uložiť hodnotenie"}
                    </button>
                  </div>
                )}

                {titleRole !== "ÚDRŽBA" && !ratedWorkerName && (
                  <div className="rating-worker-missing">
                    Pri tejto závade sa nepodarilo nájsť údržbára, ktorý ju riešil.
                  </div>
                )}
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

        {globalWindows}
      </>
    );
  };

  /* =========================================================
     PREVÁDZKOVÝ MANAŽÉR - LOGIN
     ========================================================= */

  if (screen === "operations-login") {
    return (
      <>
        <main className="app-shell">
          <section className="app-card login-card operations-login-card">
            <div className="top-bar">
              <button className="back-button" onClick={() => setScreen("home")}>
                ← Späť
              </button>
              <img src={tatralandiaLogo} alt="Tatralandia" className="small-logo" />
            </div>
            <div className="operations-login-icon">📊</div>
            <div className="section-badge">PREVÁDZKOVÝ MANAŽÉR</div>
            <h1>Prihlásenie manažéra</h1>
            <p className="subtitle">
              Kompletný prehľad závad, rozhodovanie, história a štatistika.
            </p>
            <form className="report-form" onSubmit={loginOperations}>
              <label>
                Vaše meno
                <input
                  type="text"
                  placeholder="Napr. Peter Novák..."
                  value={operationsName}
                  onChange={(e) => setOperationsName(e.target.value)}
                />
              </label>
              <label>
                Heslo prevádzky
                <input
                  className="password-input"
                  type="password"
                  placeholder="Zadajte heslo"
                  value={operationsPassword}
                  onChange={(e) => setOperationsPassword(e.target.value)}
                />
              </label>
              <button className="submit-button" type="submit">
                📊 Prihlásiť sa
              </button>
            </form>
            <div className="test-password">
              Testovacie heslo: <strong>prevadzka1234</strong>
            </div>
          </section>
        </main>
        {globalWindows}
      </>
    );
  }

  /* =========================================================
     PREVÁDZKOVÝ MANAŽÉR - DETAIL ZÁVADY
     ========================================================= */

  if (screen === "operations-issue" && selectedIssue) {
    const communicationEvents = issueEvents.filter(
      (event) =>
        [
          "material_requested",
          "escalated_to_manager",
          "returned_to_maintenance",
          "manager_resolved",
          "escalated_to_operations",
          "returned_to_manager",
          "operations_resolved",
          "operations_task_created",
          "resolved",
          "reopened_by_manager",
          "reopened_by_operations",
        ].includes(event.event_type) && Boolean(event.message || event.photo_key)
    );

    const ratedWorkerName = getMaintenanceWorkerFromEvents(issueEvents);
    const issueRatings = issueEvents.filter((event) =>
      ["rating_up", "rating_down"].includes(event.event_type)
    );
    const latestRating = issueRatings[0];

    return (
      <>
        <main className="app-shell">
          <section className="app-card issue-detail-card operations-detail-card">
            <div className="top-bar">
              <button
                className="back-button"
                onClick={() => setScreen(operationsIssueReturn)}
              >
                ← Späť
              </button>
              <img src={tatralandiaLogo} alt="Tatralandia" className="small-logo" />
            </div>
            <div className="operations-role-badge">PREVÁDZKOVÝ MANAŽÉR</div>
            <div className="issue-detail-number">
              ZÁVADA #{String(selectedIssue.id).padStart(4, "0")}
            </div>
            <div className={`issue-detail-status status-${selectedIssue.status}`}>
              {statusLabel(selectedIssue.status)}
            </div>
            <h1 className="issue-detail-title">{selectedIssue.description}</h1>

            <div className="operations-age-summary">
              <div>
                <small>VEK ZÁVADY</small>
                <strong>{daysSince(selectedIssue.created_at)} dní</strong>
              </div>
              <div>
                <small>BEZ POHYBU</small>
                <strong>{daysSince(selectedIssue.updated_at)} dní</strong>
              </div>
            </div>

            <div className="issue-detail-box">
              <div className="detail-row">
                <span className="detail-icon">📍</span>
                <div><small>MIESTO</small><strong>{selectedIssue.location}</strong></div>
              </div>
              <div className="detail-row">
                <span className="detail-icon">👤</span>
                <div><small>NAHLÁSIL</small><strong>{selectedIssue.reporter_name}</strong></div>
              </div>
              <div className="detail-row">
                <span className="detail-icon">🔧</span>
                <div><small>ZODPOVEDNÝ ÚDRŽBÁR</small><strong>{selectedIssue.current_worker_name || "—"}</strong></div>
              </div>
              <div className="detail-row">
                <span className="detail-icon">🕒</span>
                <div><small>POSLEDNÁ AKCIA</small><strong>{selectedIssue.last_actor_name || "—"}</strong></div>
              </div>
            </div>

            {selectedIssue.photo_key ? (
              <img
                src={getPhotoUrl(selectedIssue.photo_key)}
                alt="Fotografia závady"
                className="detail-photo"
              />
            ) : (
              <div className="detail-photo-placeholder">
                <span>📷</span><strong>Bez fotografie</strong>
              </div>
            )}

            {renderCommunicationSection(communicationEvents)}

            {selectedIssue.status === "operations" && (
              <>
                <div className="manager-task-alert operations-decision-alert">
                  <span>⚠️</span>
                  <div>
                    <small>ČAKÁ NA VAŠE ROZHODNUTIE</small>
                    <strong>Vedúci údržby posunul túto závadu prevádzkovému manažérovi.</strong>
                  </div>
                </div>
                <div className="issue-actions-title">VAŠE ROZHODNUTIE</div>
                <div className="issue-action-buttons">
                  <button
                    className="issue-action-button manager-return-button"
                    onClick={() => openOperationsAction("return_manager")}
                  >
                    <span>↩️</span>
                    <div><strong>Vrátiť vedúcemu údržby</strong><small>Na doplnenie alebo ďalšie riešenie</small></div>
                  </button>
                </div>
              </>
            )}

            <div className="issue-actions-title">SPRÁVA ÚLOHY</div>
            <div className="issue-action-buttons">
              {selectedIssue.status !== "closed" ? (
                <button
                  className="issue-action-button action-resolve"
                  onClick={() => openOperationsAction("close")}
                >
                  <span>✅</span>
                  <div>
                    <strong>Uzavrieť úlohu</strong>
                    <small>Uzavrieť v ktoromkoľvek stave s povinnou poznámkou</small>
                  </div>
                </button>
              ) : (
                <button
                  className="issue-action-button manager-return-button"
                  onClick={() => openOperationsAction("reopen")}
                >
                  <span>🔄</span>
                  <div>
                    <strong>Znovu otvoriť úlohu</strong>
                    <small>Vrátiť medzi nové úlohy údržby</small>
                  </div>
                </button>
              )}
            </div>

            {selectedIssue.status === "closed" && (
              <div className="repair-rating-panel rating-live-panel">
                <div className="issue-actions-title">HODNOTENIE OPRAVY</div>

                <div className={`rating-status-badge ${
                  latestRating?.event_type === "rating_up"
                    ? "rating-status-up"
                    : latestRating?.event_type === "rating_down"
                    ? "rating-status-down"
                    : "rating-status-empty"
                }`}>
                  {latestRating?.event_type === "rating_up"
                    ? "👍 Pozitívne hodnotenie"
                    : latestRating?.event_type === "rating_down"
                    ? "👎 Negatívne hodnotenie"
                    : "○ Nehodnotené"}
                </div>

                {issueRatings.length > 0 && (
                  <div className="rating-given-list">
                    {issueRatings.map((event) => (
                      <div className="rating-given-item" key={event.id}>
                        <span className={event.event_type === "rating_up" ? "rating-thumb-up" : "rating-thumb-down"}>
                          {event.event_type === "rating_up" ? "👍" : "👎"}
                        </span>
                        <div>
                          <strong>{event.actor_name || "Hodnotiteľ"}</strong>
                          <small>{formatDate(event.created_at)}</small>
                          {event.message && <p>{event.message}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {ratedWorkerName ? (
                  <div className="rating-entry-box">
                    <div className="rating-worker-line">
                      Hodnotený údržbár: <strong>{ratedWorkerName}</strong>
                    </div>
                    <div className="rating-choice-row">
                      <button
                        type="button"
                        className={`rating-choice-button rating-up ${ratingChoice === "up" ? "rating-choice-active" : ""}`}
                        onClick={() => setRatingChoice("up")}
                      >
                        👍 Palec hore
                      </button>
                      <button
                        type="button"
                        className={`rating-choice-button rating-down ${ratingChoice === "down" ? "rating-choice-active" : ""}`}
                        onClick={() => setRatingChoice("down")}
                      >
                        👎 Palec dole
                      </button>
                    </div>
                    <textarea
                      className="rating-comment"
                      value={ratingComment}
                      onChange={(e) => setRatingComment(e.target.value)}
                      placeholder="Voliteľný komentár k hodnoteniu..."
                      rows={3}
                    />
                    <button
                      type="button"
                      className="rating-save-button"
                      disabled={!ratingChoice || actionLoading}
                      onClick={() => {
                        if (!ratingChoice) return;
                        submitRating(ratingChoice, "operations_manager", loggedOperationsName);
                      }}
                    >
                      {actionLoading ? "Ukladám..." : "Uložiť hodnotenie"}
                    </button>
                  </div>
                ) : (
                  <div className="rating-worker-missing">
                    Pri tejto závade sa nepodarilo nájsť údržbára, ktorý ju riešil.
                  </div>
                )}
              </div>
            )}

            {selectedIssue.status === "closed" && (
              <div className="resolved-info">
                <span>✓</span>
                <div>
                  <small>ZÁVADA UKONČENÁ</small>
                  <strong>Uzavrel: {selectedIssue.last_actor_name || "Údržba"}</strong>
                </div>
              </div>
            )}
          </section>
        </main>
        {globalWindows}
        {operationsActionWindow}
      </>
    );
  }

  /* =========================================================
     PREVÁDZKOVÝ MANAŽÉR - NOVÁ ÚLOHA
     ========================================================= */

  if (screen === "operations-new-task") {
    return (
      <>
        <main className="app-shell">
          <section className="app-card report-card operations-task-card">
            <div className="top-bar">
              <button className="back-button" onClick={() => setScreen("operations-dashboard")}>
                ← Prehľad
              </button>
              <img src={tatralandiaLogo} alt="Tatralandia" className="small-logo" />
            </div>
            <div className="operations-role-badge">PREVÁDZKOVÝ MANAŽÉR</div>
            <h1>Nová úloha pre vedúceho</h1>
            <p className="subtitle">
              Úloha sa odošle vedúcemu údržby. Ten ju môže ďalej vrátiť do údržby.
            </p>
            <form className="report-form" onSubmit={submitOperationsTask}>
              <label>
                Miesto / lokalita
                <input
                  value={taskLocation}
                  onChange={(e) => setTaskLocation(e.target.value)}
                  placeholder="Napr. Wellness, bazén, tobogány..."
                />
              </label>
              <label>
                Zadanie
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  rows={5}
                  placeholder="Popíšte, čo je potrebné zabezpečiť..."
                />
              </label>
              <PhotoChoice
                title="Priložiť fotografiu"
                fileName={taskPhotoName}
                onFile={(file) => {
                  setTaskPhoto(file);
                  setTaskPhotoName(file?.name || "");
                }}
              />
              <button className="submit-button" type="submit" disabled={actionLoading}>
                {actionLoading ? "Odosielam..." : "➕ Vytvoriť úlohu"}
              </button>
            </form>
          </section>
        </main>
        {globalWindows}
      </>
    );
  }

  /* =========================================================
     PREVÁDZKOVÝ MANAŽÉR - NA ROZHODNUTIE
     ========================================================= */

  if (screen === "operations-decision") {
    return (
      <>
        <main className="app-shell">
          <section className="app-card dashboard-card operations-dashboard-card">
            <div className="dashboard-header">
              <img src={tatralandiaLogo} alt="Tatralandia" className="dashboard-logo" />
              <button className="logout-button" onClick={logoutOperations}>Odhlásiť</button>
            </div>
            <div className="operations-role-badge">PREVÁDZKOVÝ MANAŽÉR</div>
            <div className="history-header">
              <div>
                <div className="section-label">ESKALOVANÉ ZÁVADY</div>
                <h1>Na rozhodnutie</h1>
              </div>
              <div className="history-count operations-count-badge">{operationsDecisionIssues.length}</div>
            </div>
            <p className="history-subtitle">
              Závady, ktoré vám poslal vedúci údržby na rozhodnutie.
            </p>
            <div className="issue-list">
              {operationsDecisionIssues.length === 0 ? (
                <div className="empty-box">Momentálne na vás nečaká žiadne rozhodnutie.</div>
              ) : (
                operationsDecisionIssues.map((issue) => (
                  <button
                    key={issue.id}
                    className="issue-card-new operations-decision-card"
                    onClick={async () => {
                      setSelectedIssue(issue);
                      setIssueEvents([]);
                      setOperationsIssueReturn("operations-decision");
                      setScreen("operations-issue");
                      await loadIssueEvents(issue.id);
                    }}
                  >
                    <div className="issue-main">
                      <div className="issue-top">
                        <strong>#{String(issue.id).padStart(4, "0")}</strong>
                        <span>{daysSince(issue.created_at)} dní</span>
                      </div>
                      <h3>{issue.description}</h3>
                      <p>📍 {issue.location}</p>
                      <div className="operations-stale-line">
                        Bez pohybu: <strong>{daysSince(issue.updated_at)} dní</strong>
                      </div>
                    </div>
                    <div className="issue-arrow">›</div>
                  </button>
                ))
              )}
            </div>
            {operationsBottomNav("decision")}
          </section>
        </main>
        {globalWindows}
      </>
    );
  }

  /* =========================================================
     PREVÁDZKOVÝ MANAŽÉR - HISTÓRIA
     ========================================================= */

  if (screen === "operations-history") {
    return (
      <>
        <main className="app-shell">
          <section className="app-card dashboard-card operations-dashboard-card">
            <div className="dashboard-header">
              <img src={tatralandiaLogo} alt="Tatralandia" className="dashboard-logo" />
              <button className="logout-button" onClick={logoutOperations}>Odhlásiť</button>
            </div>
            <div className="operations-role-badge">PREVÁDZKOVÝ MANAŽÉR</div>
            <div className="history-header">
              <div><div className="section-label">ARCHÍV</div><h1>História</h1></div>
              <div className="history-count">{closedCount}</div>
            </div>
            <p className="history-subtitle">Kompletný zoznam uzavretých závad.</p>
            <div className="history-list">
              {closedIssues.length === 0 ? (
                <div className="empty-box">Zatiaľ nie sú žiadne uzavreté závady.</div>
              ) : (
                closedIssues.map((issue) => (
                  <button
                    className="history-card"
                    key={issue.id}
                    onClick={async () => {
                      setSelectedIssue(issue);
                      setIssueEvents([]);
                      setRatingChoice(null);
                      setRatingComment("");
                      setScreen("operations-history-detail");
                      await loadIssueEvents(issue.id);
                    }}
                  >
                    <div className="history-card-status">✓</div>
                    <div className="history-card-main">
                      <div className="history-card-top">
                        <strong>#{String(issue.id).padStart(4, "0")}</strong>
                        <span>{formatDate(issue.closed_at || issue.updated_at)}</span>
                      </div>
                      <h3>{issue.description}</h3>
                      <p>📍 {issue.location}</p>
                      <small>
                        👍 {issue.rating_up_count || 0} &nbsp; 👎 {issue.rating_down_count || 0}
                      </small>
                    </div>
                    {issue.photo_key ? (
                      <img src={getPhotoUrl(issue.photo_key)} className="history-card-photo" alt="Fotografia" />
                    ) : (
                      <div className="history-card-no-photo">📷</div>
                    )}
                    <div className="issue-arrow">›</div>
                  </button>
                ))
              )}
            </div>
            {operationsBottomNav("history")}
          </section>
        </main>
        {globalWindows}
      </>
    );
  }

  /* =========================================================
     PREVÁDZKOVÝ MANAŽÉR - ŠTATISTIKA
     ========================================================= */

  if (screen === "operations-statistics") {
    const maxLocation = Math.max(1, ...locationStats.map(([, count]) => count));
    const positiveRatings = currentMonthRatings.filter((item) => item.event_type === "rating_up").length;
    const negativeRatings = currentMonthRatings.filter((item) => item.event_type === "rating_down").length;

    return (
      <>
        <main className="app-shell">
          <section className="app-card dashboard-card operations-dashboard-card">
            <div className="dashboard-header">
              <img src={tatralandiaLogo} alt="Tatralandia" className="dashboard-logo" />
              <button className="logout-button" onClick={logoutOperations}>Odhlásiť</button>
            </div>
            <div className="operations-role-badge">PREVÁDZKOVÝ MANAŽÉR</div>
            <div className="dashboard-title-row">
              <div><div className="section-label">VÝKON A TRENDY</div><h1>Štatistika</h1></div>
              <button className="notification-bell" onClick={() => Promise.all([loadIssues(), loadRatings()])}>↻</button>
            </div>

            <div className="operations-kpi-grid">
              <div className="operations-kpi-card"><small>VŠETKY ZÁVADY</small><strong>{issues.length}</strong></div>
              <div className="operations-kpi-card"><small>OTVORENÉ</small><strong>{openIssues.length}</strong></div>
              <div className="operations-kpi-card"><small>UZAVRETÉ</small><strong>{closedCount}</strong></div>
              <div className="operations-kpi-card"><small>NA ROZHODNUTIE</small><strong>{operationsCount}</strong></div>
              <div className="operations-kpi-card"><small>ČAKÁ NA MATERIÁL</small><strong>{materialCount}</strong></div>
              <div className="operations-kpi-card"><small>PRIEMERNÉ RIEŠENIE</small><strong>{averageResolutionDays.toFixed(1)} d</strong></div>
            </div>

            <div className="operations-stats-panel">
              <div className="operations-panel-title">NAJČASTEJŠIE LOKALITY</div>
              {locationStats.length === 0 ? (
                <div className="communication-empty">Zatiaľ nie sú dáta.</div>
              ) : (
                locationStats.map(([locationName, count]) => (
                  <div className="location-stat-row" key={locationName}>
                    <div className="location-stat-label"><span>{locationName}</span><strong>{count}</strong></div>
                    <div className="location-stat-track"><div style={{ width: `${Math.max(8, (count / maxLocation) * 100)}%` }} /></div>
                  </div>
                ))
              )}
            </div>

            <div className="operations-stats-panel">
              <div className="operations-panel-title">SPÄTNÁ VÄZBA - TENTO MESIAC</div>
              <div className="rating-month-summary">
                <div><span>👍</span><strong>{positiveRatings}</strong><small>Palec hore</small></div>
                <div><span>👎</span><strong>{negativeRatings}</strong><small>Palec dole</small></div>
              </div>
              {employeeRatingStats.length === 0 ? (
                <div className="communication-empty">Tento mesiac zatiaľ nie sú hodnotenia údržbárov.</div>
              ) : (
                <div className="employee-rating-table">
                  {employeeRatingStats.map((worker) => {
                    const total = worker.up + worker.down;
                    const positive = total ? Math.round((worker.up / total) * 100) : 0;
                    return (
                      <div className="employee-rating-row" key={worker.name}>
                        <div><strong>{worker.name}</strong><small>{total} hodnotení • {positive}% pozitívnych</small></div>
                        <span className="employee-rating-up">👍 {worker.up}</span>
                        <span className="employee-rating-down">👎 {worker.down}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {operationsBottomNav("statistics")}
          </section>
        </main>
        {globalWindows}
      </>
    );
  }

  /* =========================================================
     PREVÁDZKOVÝ MANAŽÉR - PREHĽAD
     ========================================================= */

  if (screen === "operations-dashboard") {
    const statusCards: Array<[OperationsStatusFilter, string, number, string]> = [
      ["all", "Všetky", issues.length, "▦"],
      ["new", "Nové", newCount, "⚠️"],
      ["progress", "Rozpracované", progressCount, "🔧"],
      ["material", "Materiál", materialCount, "📦"],
      ["manager", "U vedúceho", managerCount, "🛠️"],
      ["operations", "Eskalované mne", operationsCount, "📊"],
      ["closed", "Uzavreté", closedCount, "✅"],
    ];
    const ageOptions = [0, 1, 7, 30, 365];

    return (
      <>
        <main className="app-shell">
          <section className="app-card dashboard-card operations-dashboard-card">
            <div className="dashboard-header">
              <img src={tatralandiaLogo} alt="Tatralandia" className="dashboard-logo" />
              <button className="logout-button" onClick={logoutOperations}>Odhlásiť</button>
            </div>
            <div className="operations-role-badge">PREVÁDZKOVÝ MANAŽÉR</div>
            <div className="welcome-block operations-welcome">
              <div><span>PRIHLÁSENÝ MANAŽÉR</span><h2>{loggedOperationsName}</h2></div>
              <div className="worker-avatar">📊</div>
            </div>
            <div className="dashboard-title-row">
              <div><div className="section-label">CELÁ ÚDRŽBA</div><h1>Prehľad</h1></div>
              <button className="operations-add-task" onClick={() => setScreen("operations-new-task")}>＋ Úloha</button>
            </div>

            <div className="feature-quick-grid management-feature-grid operations-feature-grid">
              <button onClick={() => openAlerts("management", true)}>
                <span>⚠️</span><div><strong>Upozornenia</strong><small>Odstávky a prevádzkové info</small></div>
              </button>
              <button className="feature-add-alert" onClick={() => { setAlertsAudience("management"); setAlertsPanelOpen(true); void loadAlerts("management", true); openAlertEditor(); }}>
                <span>＋</span><div><strong>Nové upozornenie</strong><small>Publikovať pre areál</small></div>
              </button>
            </div>

            <div className="operations-status-grid">
              {statusCards.map(([status, label, count, icon]) => (
                <button
                  key={status}
                  className={`operations-status-card ${operationsStatusFilter === status ? "operations-status-active" : ""}`}
                  onClick={() => setOperationsStatusFilter(status)}
                >
                  <span>{icon}</span><strong>{count}</strong><small>{label}</small>
                </button>
              ))}
            </div>

            <div className="manager-search-wrap operations-search-wrap">
              <span>🔎</span>
              <input
                value={operationsSearch}
                onChange={(e) => setOperationsSearch(e.target.value)}
                placeholder="Hľadať podľa popisu, miesta, mena alebo komentára..."
              />
              {operationsSearch && <button onClick={() => setOperationsSearch("")}>×</button>}
            </div>

            <div className="operations-filter-block">
              <div className="operations-filter-title">VEK ZÁVADY OD NAHLÁSENIA</div>
              <div className="operations-filter-chips">
                {ageOptions.map((value) => (
                  <button
                    key={`age-${value}`}
                    className={operationsAgeFilter === value ? "filter-chip-active" : ""}
                    onClick={() => setOperationsAgeFilter(value)}
                  >
                    {value === 0 ? "Všetky" : value === 365 ? "> 1 rok" : `> ${value} dní`}
                  </button>
                ))}
              </div>
            </div>

            <div className="operations-filter-block operations-stale-block">
              <div className="operations-filter-title">BEZ POHYBU / POSLEDNEJ AKCIE</div>
              <div className="operations-filter-chips">
                {ageOptions.map((value) => (
                  <button
                    key={`stale-${value}`}
                    className={operationsStaleFilter === value ? "filter-chip-active" : ""}
                    onClick={() => setOperationsStaleFilter(value)}
                  >
                    {value === 0 ? "Všetky" : value === 365 ? "> 1 rok" : `> ${value} dní`}
                  </button>
                ))}
              </div>
            </div>

            <div className="dashboard-section operations-issue-section">
              <div className="dashboard-section-heading">
                <strong>Závady</strong><span>{operationsFilteredIssues.length} položiek</span>
              </div>
              <div className="issue-list">
                {issuesLoading ? (
                  <div className="loading-box">Načítavam závady...</div>
                ) : operationsFilteredIssues.length === 0 ? (
                  <div className="empty-box">Pre zvolené filtre sa nenašli žiadne závady.</div>
                ) : (
                  operationsFilteredIssues.map((issue) => (
                    <button
                      className="issue-card-new operations-issue-card"
                      key={issue.id}
                      onClick={async () => {
                        setSelectedIssue(issue);
                        setIssueEvents([]);
                        setOperationsIssueReturn("operations-dashboard");
                        setScreen("operations-issue");
                        await loadIssueEvents(issue.id);
                      }}
                    >
                      <div className="issue-main">
                        <div className="issue-top">
                          <strong>#{String(issue.id).padStart(4, "0")}</strong>
                          <span>{formatDate(issue.created_at)}</span>
                        </div>
                        <h3>{issue.description}</h3>
                        <p>📍 {issue.location}</p>
                        <div className="operations-issue-meta">
                          <span className={`mini-status status-${issue.status}`}>{statusLabel(issue.status)}</span>
                          <span>Vek: <strong>{daysSince(issue.created_at)} d</strong></span>
                          <span>Bez pohybu: <strong>{daysSince(issue.updated_at)} d</strong></span>
                        </div>
                      </div>
                      {issue.photo_key ? (
                        <img src={getPhotoUrl(issue.photo_key)} alt="Fotografia" className="issue-photo" />
                      ) : (
                        <div className="issue-no-photo">📷</div>
                      )}
                      <div className="issue-arrow">›</div>
                    </button>
                  ))
                )}
              </div>
            </div>
            {operationsBottomNav("overview")}
          </section>
        </main>
        {globalWindows}
      </>
    );
  }

  if (screen === "operations-history-detail") {
    return renderHistoryDetail(
      "operations-history",
      "PREVÁDZKOVÝ MANAŽÉR"
    );
  }

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
                        setRatingChoice(null);
                        setRatingComment("");

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

                        <div className={`history-rating-state ${
                          (issue.rating_up_count || 0) > 0
                            ? "history-rating-up"
                            : (issue.rating_down_count || 0) > 0
                            ? "history-rating-down"
                            : "history-rating-empty"
                        }`}>
                          {(issue.rating_up_count || 0) > 0
                            ? `👍 ${issue.rating_up_count} hodnotenie`
                            : (issue.rating_down_count || 0) > 0
                            ? `👎 ${issue.rating_down_count} hodnotenie`
                            : "○ Nehodnotené"}
                        </div>

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
            {managerBottomNav("history")}

          </section>
        </main>

        {globalWindows}
      </>
    );
  }

  /* =========================================================
     VEDÚCI ÚDRŽBY - NA ROZHODNUTIE
     ========================================================= */

  if (screen === "manager-decision") {
    return (
      <>
        <main className="app-shell">
          <section className="app-card dashboard-card operations-dashboard-card">
            <div className="dashboard-header">
              <img src={tatralandiaLogo} alt="Tatralandia" className="dashboard-logo" />
              <button className="logout-button" onClick={logoutManager}>Odhlásiť</button>
            </div>

            <div className="manager-header-badge">VEDÚCI ÚDRŽBY</div>

            <div className="history-header">
              <div>
                <div className="section-label">ZÁVADY NA ROZHODNUTIE</div>
                <h1>Na rozhodnutie</h1>
              </div>
              <div className="history-count operations-count-badge">
                {managerDecisionIssues.length}
              </div>
            </div>

            <p className="history-subtitle">
              Závady posunuté vedúcemu údržby alebo čakajúce na materiál.
            </p>

            <div className="issue-list">
              {managerDecisionIssues.length === 0 ? (
                <div className="empty-box">
                  Momentálne na vás nečaká žiadne rozhodnutie.
                </div>
              ) : (
                managerDecisionIssues.map((issue) => (
                  <button
                    key={issue.id}
                    className="issue-card-new operations-decision-card"
                    onClick={async () => {
                      setSelectedIssue(issue);
                      setIssueEvents([]);
                      setScreen("manager-issue");
                      await loadIssueEvents(issue.id);
                    }}
                  >
                    <div className="issue-main">
                      <div className="issue-top">
                        <strong>#{String(issue.id).padStart(4, "0")}</strong>
                        <span>{daysSince(issue.created_at)} dní</span>
                      </div>
                      <h3>{issue.description}</h3>
                      <p>📍 {issue.location}</p>
                      <div className="operations-issue-meta">
                        <span className={`mini-status status-${issue.status}`}>
                          {statusLabel(issue.status)}
                        </span>
                        <span>
                          Bez pohybu: <strong>{daysSince(issue.updated_at)} d</strong>
                        </span>
                      </div>
                    </div>
                    <div className="issue-arrow">›</div>
                  </button>
                ))
              )}
            </div>

            {managerBottomNav("decision")}
          </section>
        </main>
        {globalWindows}
      </>
    );
  }

  /* =========================================================
     VEDÚCI ÚDRŽBY - ŠTATISTIKA
     ========================================================= */

  if (screen === "manager-statistics") {
    const maxLocation = Math.max(1, ...locationStats.map(([, count]) => count));
    const positiveRatings = currentMonthRatings.filter(
      (item) => item.event_type === "rating_up"
    ).length;
    const negativeRatings = currentMonthRatings.filter(
      (item) => item.event_type === "rating_down"
    ).length;

    return (
      <>
        <main className="app-shell">
          <section className="app-card dashboard-card operations-dashboard-card">
            <div className="dashboard-header">
              <img src={tatralandiaLogo} alt="Tatralandia" className="dashboard-logo" />
              <button className="logout-button" onClick={logoutManager}>Odhlásiť</button>
            </div>

            <div className="manager-header-badge">VEDÚCI ÚDRŽBY</div>

            <div className="dashboard-title-row">
              <div>
                <div className="section-label">VÝKON A TRENDY</div>
                <h1>Štatistika</h1>
              </div>
              <button
                className="notification-bell"
                onClick={() => Promise.all([loadIssues(), loadRatings()])}
              >
                ↻
              </button>
            </div>

            <div className="operations-kpi-grid">
              <div className="operations-kpi-card"><small>VŠETKY ZÁVADY</small><strong>{issues.length}</strong></div>
              <div className="operations-kpi-card"><small>OTVORENÉ</small><strong>{openIssues.length}</strong></div>
              <div className="operations-kpi-card"><small>UZAVRETÉ</small><strong>{closedCount}</strong></div>
              <div className="operations-kpi-card"><small>NA ROZHODNUTIE</small><strong>{managerDecisionIssues.length}</strong></div>
              <div className="operations-kpi-card"><small>ČAKÁ NA MATERIÁL</small><strong>{materialCount}</strong></div>
              <div className="operations-kpi-card"><small>PRIEMERNÉ RIEŠENIE</small><strong>{averageResolutionDays.toFixed(1)} d</strong></div>
            </div>

            <div className="operations-stats-panel">
              <div className="operations-panel-title">NAJČASTEJŠIE LOKALITY</div>
              {locationStats.length === 0 ? (
                <div className="communication-empty">Zatiaľ nie sú dáta.</div>
              ) : (
                locationStats.map(([locationName, count]) => (
                  <div className="location-stat-row" key={locationName}>
                    <div className="location-stat-label"><span>{locationName}</span><strong>{count}</strong></div>
                    <div className="location-stat-track">
                      <div style={{ width: `${Math.max(8, (count / maxLocation) * 100)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="operations-stats-panel">
              <div className="operations-panel-title">SPÄTNÁ VÄZBA - TENTO MESIAC</div>
              <div className="rating-month-summary">
                <div><span>👍</span><strong>{positiveRatings}</strong><small>Palec hore</small></div>
                <div><span>👎</span><strong>{negativeRatings}</strong><small>Palec dole</small></div>
              </div>
              {employeeRatingStats.length === 0 ? (
                <div className="communication-empty">Tento mesiac zatiaľ nie sú hodnotenia údržbárov.</div>
              ) : (
                <div className="employee-rating-table">
                  {employeeRatingStats.map((worker) => {
                    const total = worker.up + worker.down;
                    const positive = total ? Math.round((worker.up / total) * 100) : 0;
                    return (
                      <div className="employee-rating-row" key={worker.name}>
                        <div>
                          <strong>{worker.name}</strong>
                          <small>{total} hodnotení • {positive}% pozitívnych</small>
                        </div>
                        <span className="employee-rating-up">👍 {worker.up}</span>
                        <span className="employee-rating-down">👎 {worker.down}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {managerBottomNav("statistics")}
          </section>
        </main>
        {globalWindows}
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

    const communicationEvents =
      issueEvents.filter(
        (event) =>
          [
            "material_requested",
            "escalated_to_manager",
            "returned_to_maintenance",
            "manager_resolved",
            "escalated_to_operations",
            "returned_to_manager",
            "operations_resolved",
            "operations_task_created",
            "resolved",
            "duplicate_report",
            "reopened_by_manager",
            "reopened_by_operations",
          ].includes(event.event_type) &&
          Boolean(
            event.message ||
              event.photo_key
          )
      );

    const ratedWorkerName =
      getMaintenanceWorkerFromEvents(issueEvents);
    const issueRatings = issueEvents.filter(
      (event) =>
        ["rating_up", "rating_down"].includes(
          event.event_type
        )
    );
    const latestRating = issueRatings[0];

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

            {renderCommunicationSection(
              communicationEvents
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

            <div className="issue-actions-title">SPRÁVA ÚLOHY</div>
            <div className="issue-action-buttons">
              {selectedIssue.status !== "closed" ? (
                <button
                  className="issue-action-button action-resolve"
                  onClick={() => openManagerAction("close")}
                >
                  <span>✅</span>
                  <div>
                    <strong>Uzavrieť úlohu</strong>
                    <small>Uzavrieť v ktoromkoľvek stave s povinnou poznámkou</small>
                  </div>
                </button>
              ) : (
                <button
                  className="issue-action-button manager-return-button"
                  onClick={() => openManagerAction("reopen")}
                >
                  <span>🔄</span>
                  <div>
                    <strong>Znovu otvoriť úlohu</strong>
                    <small>Vrátiť medzi nové úlohy údržby</small>
                  </div>
                </button>
              )}
            </div>

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
              <div className="repair-rating-panel rating-live-panel">
                <div className="issue-actions-title">
                  HODNOTENIE OPRAVY
                </div>

                <div className={`rating-status-badge ${
                  latestRating?.event_type === "rating_up"
                    ? "rating-status-up"
                    : latestRating?.event_type === "rating_down"
                    ? "rating-status-down"
                    : "rating-status-empty"
                }`}>
                  {latestRating?.event_type === "rating_up"
                    ? "👍 Pozitívne hodnotenie"
                    : latestRating?.event_type === "rating_down"
                    ? "👎 Negatívne hodnotenie"
                    : "○ Nehodnotené"}
                </div>

                {issueRatings.length > 0 && (
                  <div className="rating-given-list">
                    {issueRatings.map((event) => (
                      <div className="rating-given-item" key={event.id}>
                        <span className={event.event_type === "rating_up" ? "rating-thumb-up" : "rating-thumb-down"}>
                          {event.event_type === "rating_up" ? "👍" : "👎"}
                        </span>
                        <div>
                          <strong>{event.actor_name || "Hodnotiteľ"}</strong>
                          <small>{formatDate(event.created_at)}</small>
                          {event.message && <p>{event.message}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {ratedWorkerName ? (
                  <div className="rating-entry-box">
                    <div className="rating-worker-line">
                      Hodnotený údržbár: <strong>{ratedWorkerName}</strong>
                    </div>
                    <div className="rating-choice-row">
                      <button
                        type="button"
                        className={`rating-choice-button rating-up ${ratingChoice === "up" ? "rating-choice-active" : ""}`}
                        onClick={() => setRatingChoice("up")}
                      >
                        👍 Palec hore
                      </button>
                      <button
                        type="button"
                        className={`rating-choice-button rating-down ${ratingChoice === "down" ? "rating-choice-active" : ""}`}
                        onClick={() => setRatingChoice("down")}
                      >
                        👎 Palec dole
                      </button>
                    </div>
                    <textarea
                      className="rating-comment"
                      value={ratingComment}
                      onChange={(e) => setRatingComment(e.target.value)}
                      placeholder="Voliteľný komentár k hodnoteniu..."
                      rows={3}
                    />
                    <button
                      type="button"
                      className="rating-save-button"
                      disabled={!ratingChoice || actionLoading}
                      onClick={() => {
                        if (!ratingChoice) return;
                        submitRating(ratingChoice, "maintenance_manager", loggedManagerName);
                      }}
                    >
                      {actionLoading ? "Ukladám..." : "Uložiť hodnotenie"}
                    </button>
                  </div>
                ) : (
                  <div className="rating-worker-missing">
                    Pri tejto závade sa nepodarilo nájsť údržbára, ktorý ju riešil.
                  </div>
                )}
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

        {globalWindows}
        {managerActionWindow}
      </>
    );
  }

  /* =========================================================
     VEDÚCI ÚDRŽBY - PREHĽAD VŠETKÝCH ZÁVAD
     ========================================================= */

  if (screen === "manager-dashboard") {
    const statusCards: Array<[OperationsStatusFilter, string, number, string]> = [
      ["all", "Všetky", issues.length, "▦"],
      ["new", "Nové", newCount, "⚠️"],
      ["progress", "Rozpracované", progressCount, "🔧"],
      ["material", "Materiál", materialCount, "📦"],
      ["manager", "U vedúceho", managerCount, "🛠️"],
      ["operations", "U prevádzkového", operationsCount, "📊"],
      ["closed", "Uzavreté", closedCount, "✅"],
    ];
    const ageOptions = [0, 1, 7, 30, 365];

    return (
      <>
        <main className="app-shell">
          <section className="app-card dashboard-card operations-dashboard-card">
            <div className="dashboard-header">
              <img src={tatralandiaLogo} alt="Tatralandia" className="dashboard-logo" />
              <button className="logout-button" onClick={logoutManager}>Odhlásiť</button>
            </div>

            <div className="manager-header-badge">VEDÚCI ÚDRŽBY</div>

            <div className="welcome-block operations-welcome">
              <div>
                <span>PRIHLÁSENÝ VEDÚCI</span>
                <h2>{loggedManagerName}</h2>
              </div>
              <div className="worker-avatar">🛠️</div>
            </div>

            <div className="dashboard-title-row">
              <div>
                <div className="section-label">CELÁ ÚDRŽBA</div>
                <h1>Prehľad</h1>
              </div>
              <button className="notification-bell" onClick={loadIssues}>↻</button>
            </div>

            <div className="feature-quick-grid management-feature-grid">
              <button onClick={() => openMessages("manager")}>
                <span>💬</span><div><strong>Správy od údržby</strong><small>{messages.filter((item) => item.status === "open").length} otvorených</small></div>
              </button>
              <button onClick={() => openAlerts("management", true)}>
                <span>⚠️</span><div><strong>Upozornenia</strong><small>Odstávky a prevádzkové info</small></div>
              </button>
              <button className="feature-add-alert" onClick={() => { setAlertsAudience("management"); setAlertsPanelOpen(true); void loadAlerts("management", true); openAlertEditor(); }}>
                <span>＋</span><div><strong>Nové upozornenie</strong><small>Publikovať pre areál</small></div>
              </button>
            </div>

            <div className="operations-status-grid">
              {statusCards.map(([status, label, count, icon]) => (
                <button
                  key={status}
                  className={`operations-status-card ${
                    managerStatusFilter === status ? "operations-status-active" : ""
                  }`}
                  onClick={() => setManagerStatusFilter(status)}
                >
                  <span>{icon}</span><strong>{count}</strong><small>{label}</small>
                </button>
              ))}
            </div>

            <div className="manager-search-wrap operations-search-wrap">
              <span>🔎</span>
              <input
                value={managerSearch}
                onChange={(e) => setManagerSearch(e.target.value)}
                placeholder="Hľadať podľa popisu, miesta, mena alebo komentára..."
              />
              {managerSearch && <button onClick={() => setManagerSearch("")}>×</button>}
            </div>

            <div className="operations-filter-block">
              <div className="operations-filter-title">VEK ZÁVADY OD NAHLÁSENIA</div>
              <div className="operations-filter-chips">
                {ageOptions.map((value) => (
                  <button
                    key={`manager-age-${value}`}
                    className={managerAgeFilter === value ? "filter-chip-active" : ""}
                    onClick={() => setManagerAgeFilter(value)}
                  >
                    {value === 0 ? "Všetky" : value === 365 ? "> 1 rok" : `> ${value} dní`}
                  </button>
                ))}
              </div>
            </div>

            <div className="operations-filter-block operations-stale-block">
              <div className="operations-filter-title">BEZ POHYBU / POSLEDNEJ AKCIE</div>
              <div className="operations-filter-chips">
                {ageOptions.map((value) => (
                  <button
                    key={`manager-stale-${value}`}
                    className={managerStaleFilter === value ? "filter-chip-active" : ""}
                    onClick={() => setManagerStaleFilter(value)}
                  >
                    {value === 0 ? "Všetky" : value === 365 ? "> 1 rok" : `> ${value} dní`}
                  </button>
                ))}
              </div>
            </div>

            <div className="dashboard-section operations-issue-section">
              <div className="dashboard-section-heading">
                <strong>Závady</strong>
                <span>{managerFilteredIssues.length} položiek</span>
              </div>

              <div className="issue-list">
                {issuesLoading ? (
                  <div className="loading-box">Načítavam závady...</div>
                ) : managerFilteredIssues.length === 0 ? (
                  <div className="empty-box">Pre zvolené filtre sa nenašli žiadne závady.</div>
                ) : (
                  managerFilteredIssues.map((issue) => (
                    <button
                      className="issue-card-new operations-issue-card"
                      key={issue.id}
                      onClick={async () => {
                        setSelectedIssue(issue);
                        setIssueEvents([]);
                        setScreen("manager-issue");
                        await loadIssueEvents(issue.id);
                      }}
                    >
                      <div className="issue-main">
                        <div className="issue-top">
                          <strong>#{String(issue.id).padStart(4, "0")}</strong>
                          <span>{formatDate(issue.created_at)}</span>
                        </div>
                        <h3>{issue.description}</h3>
                        <p>📍 {issue.location}</p>
                        <div className="operations-issue-meta">
                          <span className={`mini-status status-${issue.status}`}>{statusLabel(issue.status)}</span>
                          <span>Vek: <strong>{daysSince(issue.created_at)} d</strong></span>
                          <span>Bez pohybu: <strong>{daysSince(issue.updated_at)} d</strong></span>
                        </div>
                      </div>
                      {issue.photo_key ? (
                        <img src={getPhotoUrl(issue.photo_key)} alt="Fotografia" className="issue-photo" />
                      ) : (
                        <div className="issue-no-photo">📷</div>
                      )}
                      <div className="issue-arrow">›</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {managerBottomNav("overview")}
          </section>
        </main>
        {globalWindows}
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

        {globalWindows}
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

                      <div className={`history-rating-state ${
                        (issue.rating_up_count || 0) > 0
                          ? "history-rating-up"
                          : (issue.rating_down_count || 0) > 0
                          ? "history-rating-down"
                          : "history-rating-empty"
                      }`}>
                        {(issue.rating_up_count || 0) > 0
                          ? `👍 ${issue.rating_up_count} hodnotenie`
                          : (issue.rating_down_count || 0) > 0
                          ? `👎 ${issue.rating_down_count} hodnotenie`
                          : "○ Nehodnotené"}
                      </div>

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

        {globalWindows}
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
    const communicationEvents =
      issueEvents.filter(
        (event) =>
          [
            "material_requested",
            "escalated_to_manager",
            "returned_to_maintenance",
            "manager_resolved",
            "escalated_to_operations",
            "returned_to_manager",
            "operations_resolved",
            "operations_task_created",
            "resolved",
            "duplicate_report",
            "reopened_by_manager",
            "reopened_by_operations",
          ].includes(event.event_type) &&
          Boolean(
            event.message ||
              event.photo_key
          )
      );

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

            {renderCommunicationSection(
              communicationEvents
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

        {globalWindows}
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

            <div className="feature-quick-grid maintenance-feature-grid">
              <button onClick={() => openMessages("maintenance")}>
                <span>💬</span><div><strong>Správa vedúcemu</strong><small>Nákup, materiál, rozpis, iné</small></div>
              </button>
              <button onClick={() => openAlerts("maintenance", false)}>
                <span>⚠️</span><div><strong>Upozornenia</strong><small>Aktuálne obmedzenia areálu</small></div>
              </button>
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
                      onClick={async () => {
                        setSelectedIssue(
                          issue
                        );

                        setIssueEvents([]);

                        setScreen(
                          "maintenance-issue"
                        );

                        await loadIssueEvents(
                          issue.id
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

        {globalWindows}
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

            <p className="subtitle">
              Zadajte svoje meno a spoločné
              heslo údržby.
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

        {globalWindows}
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

            {publicAlerts.length > 0 && (
              <div className="report-active-alerts">
                <div className="report-alerts-title">⚠ Pred nahlásením skontrolujte aktuálne obmedzenia</div>
                {publicAlerts.slice(0, 2).map((alert) => (
                  <button key={alert.id} type="button" className={`report-alert-mini alert-${alert.alert_type}`} onClick={() => openAlerts("public", false)}>
                    <span>{alertTypeInfo[alert.alert_type].icon}</span>
                    <div>
                      <strong>{alert.title || alert.description || alertTypeInfo[alert.alert_type].label}</strong>
                      <small>{[alert.location, alert.description && alert.description !== alert.title ? alert.description : ""].filter(Boolean).join(" • ")}</small>
                    </div>
                    <b>›</b>
                  </button>
                ))}
              </div>
            )}

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

              <PhotoChoice
                title="Fotografia závady"
                fileName={photoName}
                onFile={(file) => {
                  setPhotoFile(file);
                  setPhotoName(file?.name || "");
                }}
              />

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

        {globalWindows}
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

          <div className="home-hero">

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

            <h1 className="home-title">
              Aplikácia údržby
            </h1>

            <p className="home-subtitle">
              Rýchle nahlasovanie, efektívne riešenie a jasný prehľad o údržbe Tatralandie.
            </p>

            <button
              className="report-button"
              onClick={() =>
                setScreen("report")
              }
            >

              <div className="report-button-icon">
                +
              </div>

              <div className="report-button-content">
                <strong>
                  Nahlásiť závadu
                </strong>

                <span>
                  Nové hlásenie pre údržbu
                </span>
              </div>

              <div className="arrow">
                ›
              </div>

            </button>

            <button
              className={`home-alert-button ${publicAlerts.some((item) => item.alert_type === "critical") ? "home-alert-critical" : ""}`}
              onClick={() => openAlerts("public", false)}
            >
              <div className="home-alert-icon">⚠</div>
              <div>
                <strong>Upozornenia a odstávky</strong>
                <span>{publicAlerts.length > 0 ? `${publicAlerts.length} aktuálne` : "Bez aktuálnych obmedzení"}</span>
              </div>
              {publicAlerts.length > 0 && <b>{publicAlerts.length}</b>}
              <div className="role-arrow">›</div>
            </button>

          </div>

          <div className="home-content">

            <div className="employee-login-title">
              POKRAČOVAŤ AKO
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
                setScreen("operations-login")
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
              Tatralandia • interný systém hlásenia závad
            </div>

            <div className="app-author">
              Autor aplikácie: Jaroslav Pažítka • v{APP_VERSION}
            </div>

          </div>

        </section>

      </main>

      {globalWindows}
    </>
  );
}

function TatralandiaApp() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

export default TatralandiaApp;
