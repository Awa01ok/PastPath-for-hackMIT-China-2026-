# PastPath

Currently an interactive front-end narrative project, **PastPath** presents the temporal and spatial trajectories of World War II figures in map form.

PastPath combines a geographic interface with a biographical timeline, allowing users to explore important historical figures, track their movements, and connect events across place and time. By answering **who**, **where**, and **when** at the same time, it helps create a clearer historical image in the learner’s mind.


## Project Overview

PastPath is a history visualization project centered on the years **1930 to 1950**, spanning the late interwar period, the Second World War, and the years immediately before the Cold War order solidified.

The current version already supports a **person-based narrative map**, a **timeline system**, and an initial **territory / historical map layer module**. Users can switch between historical figures, follow their movements event by event, and view how individual biographies intersect with larger geopolitical change.

The timeline and map-layer functions have been successfully integrated into the project. However, the **territory feature is still an early-stage prototype**: at present, it mainly consists of a structured database pipeline plus a simple WWII map layer used as a visual demonstration. In other words, the project already has the data architecture for historical territorial change, but the map reconstruction itself is **not yet complete or fully accurate**.

The long-term goal of PastPath is to guide users through the transformation of global order during **1930–1950**, helping them explore changing borders, wartime movements, and the interaction of major historical figures in both spatial and temporal dimensions. It is designed as a platform for WWII history enthusiasts that is both **engaging** and **deeply educational**.


## Current Features

- Interactive map-based story view for historical figures
- Sidebar with searchable people list
- Person-based event cards with movement routes
- Timeline bar covering **1930–1950**
- Character portraits serve as hyperlinks; clicking them leads directly to the corresponding individual's Wikipedia page.
- Event images serve as hyperlinks; clicking them leads directly to the corresponding event's Wikipedia page.
- Quarter-based timeline playback logic
- Route overview mode for viewing a figure’s full movement path
- Backend API for loading people, events, timeline items, and territory data
- Excel-to-SQLite content pipeline for easier data editing
- Support for local portraits, cover images, and territory GeoJSON assets


## Current Status

This project is no longer a simple static storymap.

Its current structure is:

**Excel / map data -> SQLite database -> Flask API -> front-end map interface**

That means:

- historical content is edited through spreadsheets
- the backend imports structured data into SQLite
- the front end fetches data dynamically through API endpoints
- timeline and territory layers are prepared through the same database-driven workflow


## Important Note About the Territory Module

The territory system has already been connected to the application architecture, but it should still be treated as a **demonstration-stage feature**.

At the moment, it includes:

- a territory data table structure
- timeline-to-layer mapping support
- simple GeoJSON-based WWII territorial assets
- front-end rendering logic for territory layers

It does **not yet** represent a fully polished or academically complete reconstruction of WWII territorial evolution. The existing map layer is mainly a proof of concept for the future expansion of the historical map system.


## Project Structure

```text
.
├── index.html
├── helper.html
├── config.js
├── css/
│   ├── style.css
│   └── ui-skin.css
├── js/
│   ├── api.js
│   ├── app.js
│   ├── bootstrap.js
│   ├── landing.js
│   ├── scroll-snap.js
│   ├── sidebar.js
│   ├── state.js
│   ├── story-core.js
│   ├── territory-layer.js
│   └── timeline.js
├── assets/
│   ├── covers/
│   ├── geo/
│   │   └── territories/
│   ├── icons/
│   │   └── timeline/
│   ├── map-styles/
│   ├── portraits/
│   └── ui/
├── backend/
│   ├── app.py
│   ├── import_excel.py
│   ├── pastpath.db
│   └── requirements.txt
├── database/
│   ├── pastpath_database_template.xlsx
│   └── pastpath_map_database.xlsx
├── tools/
│   └── README.txt
├── LICENSE
├── .gitignore
├── -nextStep.txt
└── -functionMightAdded.txt
```


## How the Project Works

### 1. Content Editing

The main editable data sources are the Excel files inside `database/`.

- `pastpath_database_template.xlsx` stores people, events, tags, and related story content
- `pastpath_map_database.xlsx` stores territory and historical map related information

### 2. Data Import

`backend/import_excel.py` reads the Excel files and imports them into `backend/pastpath.db`.

The import process creates and populates tables for:

- people
- person tags
- events
- event tags
- event sources
- timelines
- territories
- layer registry
- timeline-layer mapping

### 3. Backend API

`backend/app.py` runs a Flask server that exposes the historical data as API endpoints.

The front end uses these endpoints to load:

- people lists
- person details and events
- timeline items
- territory layer data

### 4. Front-End Rendering

The browser loads `index.html`, which initializes the map interface and UI logic.

Core front-end responsibilities are split across the JavaScript files:

- `bootstrap.js` starts the app and loads initial data
- `sidebar.js` handles people search, list rendering, and viewed history
- `story-core.js` controls map movement and event-story presentation
- `timeline.js` controls the timeline UI, year positions, and autoplay behavior
- `territory-layer.js` handles historical layer rendering
- `landing.js` manages the landing screen behavior
- `scroll-snap.js` manages snap-style movement between event cards
- `api.js` handles all API requests
- `state.js` stores shared front-end state


### Front End

- `index.html`  
  Main entry page for the PastPath interface.

- `helper.html`  
  A helper / test page used during development.

- `config.js`  
  Shared configuration used by the front end.

- `css/style.css`  
  Main layout and visual styles.

- `css/ui-skin.css`  
  Additional UI skinning and component styling.

- `js/story-core.js`  
  Core storymap logic, including event rendering and map behavior.

- `js/timeline.js`  
  Timeline logic for 1930–1950, including quarter-based movement and route-related interactions.

- `js/territory-layer.js`  
  Territory-layer logic for historical map rendering.

- `js/sidebar.js`  
  Search, people list, viewed people history, and sidebar rendering.

- `js/bootstrap.js`  
  Startup logic that loads the people index, initializes the timeline, and starts the map UI.

### Back End

- `backend/app.py`  
  Flask application that serves API endpoints.

- `backend/import_excel.py`  
  Import script for rebuilding the SQLite database from spreadsheet data.

- `backend/pastpath.db`  
  Local SQLite database used at runtime.

- `backend/requirements.txt`  
  Python dependencies for the backend.

### Data and Assets

- `database/pastpath_database_template.xlsx`  
  Main spreadsheet for people and events.

- `database/pastpath_map_database.xlsx`  
  Spreadsheet for territory and map-layer related data.

- `assets/portraits/`  
  Portrait images for historical figures.

- `assets/covers/`  
  Cover images for story events.

- `assets/geo/territories/`  
  GeoJSON files for territory display.

- `assets/icons/timeline/`  
  Timeline icon assets.

- `assets/ui/`  
  UI decoration assets used by the interface.

## API Endpoints

The current backend includes the following main endpoints:

- `GET /api/health`  
  Health check for the backend server.

- `GET /api/people`  
  Returns the enabled people list used by the sidebar.

- `GET /api/people/<person_id>`  
  Returns a full person record with related events.

- `GET /api/timeline`  
  Returns enabled timeline items and related milestone information.

- `GET /api/territories`  
  Returns enabled territory items, with optional filtering.

## Requirements

- Python 3
- A modern web browser
- Terminal / command line access
- Local static server for the front end

## Local Setup

### 1. Install Dependencies

**Windows**

```bash
pip install -r backend/requirements.txt
```

**macOS**

```bash
python3 -m pip install -r backend/requirements.txt
```

### 2. Import Spreadsheet Data into SQLite

**Windows**

```bash
python backend/import_excel.py
```

**macOS**

```bash
python3 backend/import_excel.py
```

This step rebuilds the local database from the Excel files.

### 3. Start the Backend Server

**Windows**

```bash
python backend/app.py
```

**macOS**

```bash
python3 backend/app.py
```

The backend runs at:

```text
http://127.0.0.1:8000
```

### 4. Start the Front-End Server

**Windows**

```bash
python -m http.server 5500
```

**macOS**

```bash
python3 -m http.server 5500
```

The front end runs at:

```text
http://127.0.0.1:5500
```

## Running the Project

Both servers must be running at the same time:

- backend on `127.0.0.1:8000`
- front end on `127.0.0.1:5500`

If only the front end is started, the page may load visually, but people, events, timeline data, and territory data will not be fetched correctly.

## Development Notes

- The project is now database-driven rather than JSON-driven.
- Historical content editing is intended to happen primarily through spreadsheet files.
- The timeline system is already integrated into the front end.
- The territory system is architecturally connected, but still incomplete as a historical reconstruction.
- The current repository includes utility notes for future expansion in `-nextStep.txt` and `-functionMightAdded.txt`.

## Future Direction

The most important future work is not basic UI wiring, but improving the historical depth of the data itself, especially in the territory system.

Key directions include:

- refining the territorial database
- improving historical map accuracy
- expanding figure coverage
- enriching event relationships between different people
- making the interaction between biography, timeline, and geopolitical change more complete


## Data & Technology Stack

PastPath is built by combining several open data sources and front-end technologies. The project integrates narrative storytelling, geospatial rendering, and structured historical data into a unified experience.

### Front-End & Interaction

- **Map Rendering**  
  Powered by **MapLibre GL JS**, enabling interactive, high-performance map visualization in the browser.

- **Scroll-based Narrative Engine**  
  The scroll-driven storytelling and event snapping behavior are inspired by **Scrollama**, allowing users to navigate historical narratives through natural scrolling.

### Historical Data Sources

- **Territorial Data**  
  Based on **CShapes 2.0**, providing a foundational dataset for country boundaries and geopolitical structures.  
  (Currently used as a structural reference; further historical refinement is ongoing.)

- **Biographical Data**  
  Person-level information is primarily sourced from **Wikidata**, serving as the backbone for historical figures and their key attributes.

### Content Generation Workflow

- **Narrative Content**  
  Event descriptions and story structures are generated through a hybrid workflow:
  - AI-assisted outline generation
  - Manual editing and refinement

  This approach ensures both **structural clarity** and **historical readability**, while maintaining flexibility for future expansion.

## Acknowledgements

This project builds upon open datasets and open-source tools.  
Special thanks to the communities behind:

- MapLibre GL JS  
- Scrollama  
- CShapes 2.0  
- Wikidata  

Their contributions make projects like PastPath possible.


## License

This repository currently includes an **MIT License**.

If the project is shared publicly, keep the license file unless you intentionally decide to adopt a different license later.
