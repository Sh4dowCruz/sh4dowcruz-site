import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  adminOpen,
  clearScores,
  deleteScore,
  getMusic,
  listPlayers,
  listScores,
  resetPlayerPin,
  setMusic,
  type PlayerRow,
  type ScoreRow,
} from "@/lib/scores.functions";

export const Route = createFileRoute("/admin")({ component: Admin });

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,23}$/;

function accountEmail(username: string) {
  return `${username.trim().toLowerCase()}@board.cruz`;
}

function keepToken(token: string | null | undefined) {
  if (!token) return;
  try {
    sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* private mode */
  }
}

function Admin() {
  const { user, isPending } = useCurrentUserState();
  const [open, setOpen] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [music, setMusicUrl] = useState("");
  const [musicNote, setMusicNote] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerNote, setPlayerNote] = useState("");

  useEffect(() => {
    adminOpen()
      .then((result) => setOpen(result.open))
      .catch(() => setError("The board could not be reached."));
  }, []);

  useEffect(() => {
    if (!user) return;
    listScores()
      .then(setRows)
      .catch(() => setError("Scores could not be loaded."));
    getMusic()
      .then((result) => setMusicUrl(result.url))
      .catch(() => setError("Music could not be loaded."));
    listPlayers()
      .then(setPlayers)
      .catch(() => setError("Players could not be loaded."));
  }, [user]);

  async function reload() {
    setRows(await listScores());
  }

  return (
    <main className="min-h-dvh bg-bg px-5 py-10 text-fg">
      <div className="mx-auto w-full max-w-lg">
        <a href="/" className="text-sm text-muted hover:text-fg">
          Back
        </a>
        <h1 className="mt-6 font-display text-4xl tracking-tight">Scores</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">One admin login for this board.</p>

        {error ? <p className="mt-4 text-sm text-fg">{error}</p> : null}

        {isPending || open === null ? (
          <p className="mt-8 text-sm text-muted">Loading</p>
        ) : user ? (
          <section className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Signed in as {user.displayName}</p>
              <button
                type="button"
                className="min-h-11 rounded-full border border-fg/10 px-4 text-sm"
                onClick={() => {
                  signOut("/admin").catch(() => setError("Sign-out did not finish. Try again."));
                }}
              >
                Sign out
              </button>
            </div>
            <form
              className="mt-8 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setError("");
                setMusicNote("");
                setMusic({ data: { url: music } })
                  .then(() => setMusicNote(music.trim() ? "Music saved." : "Music cleared."))
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "Could not save that link."),
                  );
              }}
            >
              <label className="text-xs tracking-widest text-muted uppercase" htmlFor="music-url">
                YouTube Music
              </label>
              <input
                id="music-url"
                value={music}
                onChange={(event) => setMusicUrl(event.target.value)}
                placeholder="https://music.youtube.com/watch?v="
                className="min-h-11 rounded-2xl border border-fg/10 bg-surface px-4 text-base outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="min-h-11 self-start rounded-full bg-accent px-5 text-sm font-medium text-bg"
              >
                Save music
              </button>
              {musicNote ? <p className="text-sm text-muted">{musicNote}</p> : null}
            </form>
            <h2 className="mt-10 font-display text-2xl tracking-tight">Players</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Reset a PIN when someone forgets theirs. Their streak and scores stay; the next person to play under that name sets a new PIN.
            </p>
            {playerNote ? <p className="mt-3 text-sm text-muted">{playerNote}</p> : null}
            <ul className="mt-4 flex flex-col gap-2">
              {players.length === 0 ? <li className="text-sm text-muted">No players yet.</li> : null}
              {players.map((player) => (
                <li
                  key={player.key}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-fg/10 bg-surface px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{player.name}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {player.claimed ? "PIN set" : "No PIN (free to claim)"} · {player.streak}-day streak
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={!player.claimed}
                    className="min-h-11 shrink-0 text-sm text-muted hover:text-fg disabled:opacity-40"
                    onClick={() => {
                      setError("");
                      setPlayerNote("");
                      resetPlayerPin({ data: { key: player.key } })
                        .then(() => listPlayers().then(setPlayers))
                        .then(() => setPlayerNote(`${player.name} can now set a new PIN on their next game.`))
                        .catch(() => setError("Could not reset that PIN."));
                    }}
                  >
                    Reset PIN
                  </button>
                </li>
              ))}
            </ul>
            <h2 className="mt-10 font-display text-2xl tracking-tight">Scores</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {rows.length === 0 ? <li className="text-sm text-muted">No scores yet.</li> : null}
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-fg/10 bg-surface px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{row.name}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {row.game === "dino" ? "Dinosaur" : "Snake"} · {row.score}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="min-h-11 shrink-0 text-sm text-muted hover:text-fg"
                    onClick={() => {
                      setError("");
                      deleteScore({ data: { id: row.id } })
                        .then(reload)
                        .catch(() => setError("Could not delete that score."));
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-6 min-h-11 text-sm text-muted hover:text-fg"
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  return;
                }
                setBusy(true);
                clearScores()
                  .then(reload)
                  .then(() => setConfirmClear(false))
                  .catch(() => setError("Could not clear the board."))
                  .finally(() => setBusy(false));
              }}
              disabled={busy || rows.length === 0}
            >
              {confirmClear ? "Confirm clear all" : "Clear all"}
            </button>
          </section>
        ) : (
          <AccountForm
            setup={open}
            busy={busy}
            onSubmit={async (username, password) => {
              setBusy(true);
              setError("");
              try {
                const email = accountEmail(username);
                const result = open
                  ? await authClient.signUp.email({ email, password, name: username.trim() })
                  : await authClient.signIn.email({ email, password });
                if (result.error) throw new Error(result.error.message || "That did not work.");
                keepToken(result.data?.token);
                await authClient.getSession();
                window.location.assign("/admin");
              } catch (err) {
                setError(err instanceof Error ? err.message : "That did not work.");
                setBusy(false);
              }
            }}
          />
        )}
      </div>
    </main>
  );
}

function AccountForm({
  setup,
  busy,
  onSubmit,
}: {
  setup: boolean;
  busy: boolean;
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [localError, setLocalError] = useState("");

  return (
    <form
      className="mt-8 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const slug = username.trim().toLowerCase();
        if (!USERNAME.test(slug)) {
          setLocalError("Use 3–24 letters or numbers for the admin name.");
          return;
        }
        if (password.length < 8) {
          setLocalError("Use at least 8 characters for the password.");
          return;
        }
        if (setup && password !== again) {
          setLocalError("Those passwords do not match.");
          return;
        }
        setLocalError("");
        onSubmit(slug, password);
      }}
    >
      <p className="text-sm text-muted">
        {setup ? "Create the admin login. This can only be done once." : "Sign in to remove scores."}
      </p>
      <label className="text-xs tracking-widest text-muted uppercase" htmlFor="admin-name">
        Admin name
      </label>
      <input
        id="admin-name"
        autoComplete="username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        className="min-h-11 rounded-2xl border border-fg/10 bg-surface px-4 text-base outline-none focus:border-accent"
      />
      <label className="text-xs tracking-widest text-muted uppercase" htmlFor="admin-pass">
        Password
      </label>
      <input
        id="admin-pass"
        type="password"
        autoComplete={setup ? "new-password" : "current-password"}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="min-h-11 rounded-2xl border border-fg/10 bg-surface px-4 text-base outline-none focus:border-accent"
      />
      {setup ? (
        <input
          type="password"
          autoComplete="new-password"
          aria-label="Confirm password"
          value={again}
          onChange={(event) => setAgain(event.target.value)}
          placeholder="Confirm password"
          className="min-h-11 rounded-2xl border border-fg/10 bg-surface px-4 text-base outline-none focus:border-accent"
        />
      ) : null}
      {localError ? <p className="text-sm text-fg">{localError}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-2 min-h-11 rounded-full bg-accent px-5 text-sm font-medium text-bg transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-60"
      >
        {setup ? "Create admin" : "Sign in"}
      </button>
    </form>
  );
}
