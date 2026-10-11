"""Aggregation of all v1 API routers."""

from app.api.v1.checks import router as checks_router
from app.api.v1.devices import router as devices_router
from app.api.v1.events import router as events_router
from app.api.v1.incidents import router as incidents_router
from app.api.v1.observations import router as observations_router
from app.api.v1.simulate import router as simulate_router
from app.api.v1.topology import router as topology_router
from fastapi import APIRouter

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(devices_router)
api_v1_router.include_router(checks_router)
api_v1_router.include_router(observations_router)
api_v1_router.include_router(events_router)
api_v1_router.include_router(incidents_router)
api_v1_router.include_router(topology_router)
api_v1_router.include_router(simulate_router)
