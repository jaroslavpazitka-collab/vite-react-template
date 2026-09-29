import { useState } from "react";
import "./App.css";

type Screen = "home" | "report" | "success";

function App() {
	const [screen, setScreen] = useState<Screen>("home");

	const [reporter, setReporter] = useState("");
	const [location, setLocation] = useState("");
	const [description, setDescription] = useState("");
	const [photoName, setPhotoName] = useState("");

	const submitReport = (e: React.FormEvent) => {
		e.preventDefault();

		if (!reporter.trim() || !location.trim() || !description.trim()) {
			alert("Prosím, vyplňte meno, miesto a popis závady.");
			return;
		}

		// Zatiaľ iba testujeme obrazovku.
		// Neskôr sem pripojíme Cloudflare D1 a uloženie fotografie.
		setScreen("success");
	};

	const resetReport = () => {
		setReporter("");
		setLocation("");
		setDescription("");
		setPhotoName("");
		setScreen("home");
	};

	if (screen === "report") {
		return (
			<main className="app-shell">
				<section className="app-card">
					<button className="back-button" onClick={() => setScreen("home")}>
						← Späť
					</button>

					<div className="small-brand">TATRALANDIA</div>

					<h1>Nahlásiť závadu</h1>
					<p className="subtitle">
						Vyplňte základné informácie a odošlite závadu údržbe.
					</p>

					<form className="report-form" onSubmit={submitReport}>
						<label>
							Kto nahlasuje?
							<input
								type="text"
								placeholder="Vaše meno"
								value={reporter}
								onChange={(e) => setReporter(e.target.value)}
							/>
						</label>

						<label>
							Kde sa závada nachádza?
							<input
								type="text"
								placeholder="Napr. Hala Tropic, sprchy pri šatniach"
								value={location}
								onChange={(e) => setLocation(e.target.value)}
							/>
						</label>

						<label>
							Popis závady
							<textarea
								placeholder="Stručne popíšte, čo nefunguje alebo čo je poškodené..."
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={5}
							/>
						</label>

						<label className="photo-upload">
							<span>📷 Pridať fotografiu</span>
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
							Odoslať závadu
						</button>
					</form>
				</section>
			</main>
		);
	}

	if (screen === "success") {
		return (
			<main className="app-shell">
				<section className="app-card success-card">
					<div className="success-icon">✓</div>

					<h1>Ďakujeme</h1>

					<p>
						Závada bola nahlásená a odoslaná údržbe na riešenie.
					</p>

					<button className="primary-button" onClick={resetReport}>
						Späť na úvod
					</button>
				</section>
			</main>
		);
	}

	return (
		<main className="app-shell">
			<section className="app-card home-card">
				<div className="brand-block">
					<div className="brand-logo">TATRALANDIA</div>
					<div className="brand-subtitle">Údržba areálu</div>
				</div>

				<button
					className="report-button"
					onClick={() => setScreen("report")}
				>
					<span className="report-icon">🛠️</span>
					<span>Nahlásiť závadu</span>
				</button>

				<div className="login-title">Prihlásenie pracovníkov</div>

				<div className="role-buttons">
					<button
						className="role-button"
						onClick={() =>
							alert("Prihlásenie údržbára doplníme v ďalšom kroku.")
						}
					>
						<span>🔧</span>
						Údržbár
					</button>

					<button
						className="role-button"
						onClick={() =>
							alert("Prihlásenie vedúceho údržby doplníme v ďalšom kroku.")
						}
					>
						<span>👨‍🔧</span>
						Vedúci údržby
					</button>

					<button
						className="role-button"
						onClick={() =>
							alert(
								"Prihlásenie prevádzkového manažéra doplníme v ďalšom kroku."
							)
						}
					>
						<span>📊</span>
						Prevádzkový manažér
					</button>
				</div>

				<p className="footer-text">
					Interný systém hlásenia a evidencie závad
				</p>
			</section>
		</main>
	);
}

export default App;
