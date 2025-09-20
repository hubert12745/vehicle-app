.PHONY: dev prod stop

dev:
	docker compose -f docker-compose.dev.yml up --build -d
	cd mobile && npm run dev

prod:
	docker compose up --build

stop:
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v
