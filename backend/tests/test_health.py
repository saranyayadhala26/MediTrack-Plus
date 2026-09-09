"""Unit and health check tests for MediTrack+ API."""

import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_root_endpoint():
    """Verify the root metadata endpoint returns online status."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert "medical_disclaimer" in data


@pytest.mark.asyncio
async def test_health_endpoint():
    """Verify the health check endpoint returns valid schema."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "environment" in data
        assert "database_connected" in data
        assert "medical_disclaimer" in data
