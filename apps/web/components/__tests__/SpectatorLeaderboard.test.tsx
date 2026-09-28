import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SpectatorLeaderboard from "../SpectatorLeaderboard";

const mockLeaderboardData = {
  hunt: {
    id: 1,
    title: "Test Hunt",
    description: "A test hunt description",
  },
  leaderboard: [
    { position: 1, name: "Player1", points: 100, completionCount: 5 },
    { position: 2, name: "Player2", points: 80, completionCount: 4 },
  ],
  summary: {
    topRankName: "Player1",
    topRankPoints: 100,
    playerCount: 2,
  },
  embedUrl: "http://example.com/embed",
  shareUrl: "http://example.com/share",
};

describe("SpectatorLeaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders loading state initially", () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockLeaderboardData,
    });
    
    const { container } = render(<SpectatorLeaderboard huntId="1" />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders leaderboard data after successful fetch", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockLeaderboardData,
    });

    render(<SpectatorLeaderboard huntId="1" />);

    await waitFor(() => {
      expect(screen.getByText("Test Hunt")).toBeInTheDocument();
    });

    expect(screen.getByText("A test hunt description")).toBeInTheDocument();
    expect(screen.getByText("Player1")).toBeInTheDocument();
    expect(screen.getByText("Player2")).toBeInTheDocument();
    expect(screen.getByText("100 pts")).toBeInTheDocument();
  });

  it("renders error state on fetch failure", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
    });

    render(<SpectatorLeaderboard huntId="1" />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load leaderboard")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
