# VitalsFam — Family Blood Sugar & Blood Pressure Tracker

A responsive, privacy-first web app for tracking blood sugar (glucose) and blood pressure (systolic, diastolic, pulse) across family members on both desktop and mobile devices.

## Features

- **Family Member Profiles**: Add, edit, and remove family members with relationship tags, age, custom profile colors, and health notes.
- **Date & Time Tracking**: Every reading records an exact date and time, with quick date-range filters (`7D`, `30D`, `90D`, `All`, or custom `From`–`To` dates) and a calendar-grouped History view.
- **Dual Logging**: Log Blood Pressure, Blood Sugar (with fasting / pre-meal / 2h post-meal / bedtime / random context), or both in a single form.
- **Interactive Trend Charts**: Responsive Chart.js line charts for Blood Pressure and Blood Sugar trends, plus automatic period averages.
- **Clinical Reference Indicators**: Automatic status badges based on [American Heart Association (AHA) Blood Pressure Categories](https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings) and [American Diabetes Association (ADA) Blood Glucose Guidelines](https://diabetes.org/about-diabetes/diagnosis) (with `mg/dL` and `mmol/L` unit switching).
- **Private Local Storage & Backups**: All data stays in your browser's `localStorage`, with 1-click CSV export, JSON backup/restore, and print-friendly reports.
- **Desktop & Mobile Ready**: Adaptive sidebar layout on computers and a tap-friendly bottom navigation bar on phones.

## Project Structure

```text
family-health-tracker/
├── index.html        # Main responsive HTML layout
├── css/
│   └── styles.css    # Custom styling, transitions, and print rules
├── js/
│   └── app.js        # State management, charts, date filters, CSV/JSON I/O
├── manifest.json     # Web App Manifest for mobile "Add to Home Screen"
├── README.md         # Documentation & GitHub Pages guide
├── LICENSE           # MIT License
└── .gitignore        # Standard ignore rules
```

## Running Locally

No build step or package installation is required:

1. Unzip the `family-health-tracker` folder.
2. Open `index.html` directly in any modern browser (Chrome, Safari, Firefox, Edge), or run a local server:
   ```bash
   python3 -m http.server 8000
   ```
   Then open `http://localhost:8000`.

## Publishing to GitHub & GitHub Pages

1. Create a new repository on [GitHub](https://github.com/new) (for example, `family-health-tracker`).
2. Inside the unzipped `family-health-tracker` folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: VitalsFam family blood sugar & BP tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/family-health-tracker.git
   git push -u origin main
   ```
3. To host it live for free on your phone and computer via **GitHub Pages**:
   - Open your repository on GitHub → **Settings** → **Pages**.
   - Under **Build and deployment**, set **Source** to `Deploy from a branch`, select `main` and `/ (root)`, then click **Save**.
   - Your live app URL will appear at `https://<your-username>.github.io/family-health-tracker/`.

## Disclaimer

Reference ranges shown in the app are for informational tracking only and do not constitute medical advice. Always consult a healthcare professional for diagnosis or personalized targets.
