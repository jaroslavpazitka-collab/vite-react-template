import { useState } from "react";
import tatralandiaLogo from "./assets/tatralandia-logo.jpg";
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
						Vyplňte základné informácie. Hlásenie bude odoslané priamo
						údržbe.
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
								placeholder="Napr. Hala Tropic – sprchy pri šatniach"
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
							<span>⚠️</span>
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
						onClick={() =>
							alert("Prihlásenie údržbára vytvoríme v ďalšom kroku.")
						}
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
							alert(
								"Prihlásenie vedúceho údržby vytvoríme v ďalšom kroku."
							)
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
							alert(
								"Prihlásenie prevádzkového manažéra vytvoríme v ďalšom kroku."
							)
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
