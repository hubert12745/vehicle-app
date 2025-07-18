# Smart Vehicle Care

Aplikacja mobilno‑webowa do zarządzania przeglądami, naprawami i spalaniem pojazdów. Możesz uruchomić ją dwoma sposobami:

1. **Lokalnie** na maszynie z Node.js i Pythonem (pełne środowisko).  
2. **W Dockerze** – całość w kontenerach (idealne na komputery prywatne).

---

## 1. Wymagania wstępne

- **Komputer A** (pełne środowisko):
  - Node.js LTS (≥ 16.x)
  - Python 3.11+
  - Git
- **Komputer B** (Docker):
  - Docker Desktop **lub** Docker Engine + WSL2
  - Git

---

## 2. Klonowanie repozytorium

```bash
git clone https://github.com/hubert12745/vehicle-app
cd vehicle-app

---

## 3. Zmienne środowiskowe

cp .env.example .env           # dla lokalnego dev
cp .env.example .env.docker    # dla Dockera


## 4. Lokalne środowisko

cd backend
python -m venv venv
.\venv\Scripts\activate           # PowerShell
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

cd ../mobile
npm install
npm start -- --web

## 5. Docker

# W katalogu głównym projektu:
docker compose up --build
