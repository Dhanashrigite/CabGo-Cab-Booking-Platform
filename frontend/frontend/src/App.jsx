
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";
const TOKEN_KEY = "cabgo_token";

const EMPTY_BOOKING = {
  pickup_location: "",
  drop_location: "",
  passenger_name: "",
  fare: "250",
};

function formatFare(fare) {
  return `₹${Number(fare || 0).toFixed(2)}`;
}

function normalizeStatus(status) {
  return String(status || "Pending").toLowerCase();
}

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem(TOKEN_KEY) || ""
  );

  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");

  const [authForm, setAuthForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  const [booking, setBooking] = useState({ ...EMPTY_BOOKING });
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  const isAdmin =
    String(user?.role || "").toLowerCase() === "admin";

  const request = useCallback(
    async (path, options = {}, authToken = token) => {
      const headers = {
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...(authToken
          ? { Authorization: `Bearer ${authToken}` }
          : {}),
        ...options.headers,
      };

      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });

      const responseText = await response.text();
      let data = null;

      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = responseText;
      }

      if (!response.ok) {
        const message =
          data?.detail ||
          data?.message ||
          (typeof data === "string" ? data : "") ||
          `Request failed (${response.status})`;

        throw new Error(message);
      }

      return data;
    },
    [token]
  );

  const loadRides = useCallback(
    async (activeToken, adminMode) => {
      setLoading(true);
      setError("");

      try {
        const endpoint = adminMode
          ? "/api/admin/rides"
          : "/api/rides";

        const data = await request(endpoint, {}, activeToken);
        setRides(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(`Could not load bookings: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [request]
  );

  // Verify the saved login session.
  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      if (!token) {
        setUser(null);
        setRides([]);
        setCheckingSession(false);
        return;
      }

      setCheckingSession(true);

      try {
        const currentUser = await request(
          "/api/auth/me",
          {},
          token
        );

        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
          setToken("");
          setUser(null);
          setRides([]);
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }

    verifySession();

    return () => {
      cancelled = true;
    };
  }, [token, request]);

  // Load rides for the logged-in user or admin.
  useEffect(() => {
    if (token && user) {
      loadRides(token, isAdmin);
    }
  }, [token, user, isAdmin, loadRides]);

  function updateAuthField(event) {
    const { name, value } = event.target;

    setAuthForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleAuth(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      if (authMode === "register") {
        await request(
          "/api/auth/register",
          {
            method: "POST",
            body: JSON.stringify({
              username: authForm.username.trim(),
              email: authForm.email.trim(),
              password: authForm.password,
            }),
          },
          ""
        );
      }

      const loginData = await request(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: authForm.email.trim(),
            password: authForm.password,
          }),
        },
        ""
      );

      if (!loginData?.access_token) {
        throw new Error("Login response did not contain a token.");
      }

      localStorage.setItem(
        TOKEN_KEY,
        loginData.access_token
      );

      setToken(loginData.access_token);

      const currentUser = await request(
        "/api/auth/me",
        {},
        loginData.access_token
      );

      setUser(currentUser);
      setRides([]);
      setAuthForm({
        username: "",
        email: "",
        password: "",
      });
      setNotice("Welcome to CabGo!");
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setRides([]);
    setBooking({ ...EMPTY_BOOKING });
    setError("");
    setNotice("");
    setAuthMode("login");
  }

  function updateBookingField(event) {
    const { name, value } = event.target;

    setBooking((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleBookRide(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (
      !booking.pickup_location.trim() ||
      !booking.drop_location.trim()
    ) {
      setError("Please enter both pickup and drop locations.");
      return;
    }

    if (!booking.passenger_name.trim()) {
      setError("Please enter the passenger name.");
      return;
    }

    const fareValue = Number(booking.fare);

    if (!Number.isFinite(fareValue) || fareValue <= 0) {
      setError("Please enter a valid fare greater than zero.");
      return;
    }

    setBookingLoading(true);

    try {
      await request("/api/rides", {
        method: "POST",
        body: JSON.stringify({
          pickup_location: booking.pickup_location.trim(),
          drop_location: booking.drop_location.trim(),
          passenger_name: booking.passenger_name.trim(),
          fare: fareValue,
        }),
      });

      setBooking({ ...EMPTY_BOOKING });
      setNotice("Ride booked successfully!");

      await loadRides(token, isAdmin);
    } catch (err) {
      setError(`Booking failed: ${err.message}`);
    } finally {
      setBookingLoading(false);
    }
  }

  async function updateRideStatus(rideId, status) {
    setError("");
    setNotice("");

    try {
      await request(
        `/api/rides/${rideId}/status?status_value=${encodeURIComponent(status)}`,
        { method: "PATCH" }
      );

      setNotice(`Ride #${rideId} updated to ${status}.`);
      await loadRides(token, isAdmin);
    } catch (err) {
      setError(`Could not update ride: ${err.message}`);
    }
  }

  async function deleteRide(rideId) {
    if (
      !window.confirm(
        `Are you sure you want to delete ride #${rideId}?`
      )
    ) {
      return;
    }

    setError("");
    setNotice("");

    try {
      await request(`/api/rides/${rideId}`, {
        method: "DELETE",
      });

      setNotice(`Ride #${rideId} deleted.`);
      await loadRides(token, isAdmin);
    } catch (err) {
      setError(`Could not delete ride: ${err.message}`);
    }
  }

  const stats = {
    total: rides.length,
    pending: rides.filter(
      (ride) => normalizeStatus(ride.status) === "pending"
    ).length,
    confirmed: rides.filter(
      (ride) => normalizeStatus(ride.status) === "confirmed"
    ).length,
    completed: rides.filter(
      (ride) => normalizeStatus(ride.status) === "completed"
    ).length,
    cancelled: rides.filter(
      (ride) => normalizeStatus(ride.status) === "cancelled"
    ).length,
    revenue: rides
      .filter(
        (ride) => normalizeStatus(ride.status) === "completed"
      )
      .reduce(
        (sum, ride) => sum + Number(ride.fare || 0),
        0
      ),
  };

  if (checkingSession) {
    return (
      <main className="app auth-page">
        <section className="auth-card">
          <h2>🚕 CabGo</h2>
          <p>Checking your session...</p>
        </section>
      </main>
    );
  }

  if (!token || !user) {
    return (
      <main className="app auth-page">
        <div className="auth-wrapper">
          <section className="auth-card">
            <div className="tag">🚕 CABGO BOOKING PLATFORM</div>

            <h1>
              {authMode === "login"
                ? "Welcome Back"
                : "Create Your Account"}
            </h1>

            <p>
              Sign in to book and manage your rides.
            </p>

            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}

            <form
              className="booking-form"
              onSubmit={handleAuth}
            >
              {authMode === "register" && (
                <label>
                  Username
                  <input
                    name="username"
                    value={authForm.username}
                    onChange={updateAuthField}
                    placeholder="Choose a username"
                    autoComplete="username"
                    required
                  />
                </label>
              )}

              <label>
                Email Address
                <input
                  name="email"
                  type="email"
                  value={authForm.email}
                  onChange={updateAuthField}
                  placeholder="Enter your email"
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                Password
                <input
                  name="password"
                  type="password"
                  value={authForm.password}
                  onChange={updateAuthField}
                  placeholder="Enter your password"
                  autoComplete={
                    authMode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  required
                />
              </label>

              <button
                type="submit"
                className="primary-button"
                disabled={loading}
              >
                {loading
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Login"
                    : "Create Account"}
              </button>
            </form>

            <div className="auth-switch">
              {authMode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}

              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setAuthMode(
                    authMode === "login"
                      ? "register"
                      : "login"
                  );
                  setError("");
                  setNotice("");
                }}
              >
                {authMode === "login"
                  ? "Create Account"
                  : "Login"}
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <header className="navbar">
        <a className="brand" href="#home">
          🚕 <span>CabGo</span>
        </a>

        <div className="nav-account">
          <span>
            {isAdmin ? "🛡️ Admin: " : "👤 "}
            {user.username || user.email}
          </span>

          <button
            className="logout-button"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="intro">
            <span className="tag">
              YOUR JOURNEY, OUR PRIORITY
            </span>

            <h1>
              Book your ride.
              <br />
              Enjoy your journey.
            </h1>

            <p>
              Travel comfortably to your destination with CabGo.
              Your journey starts here.
            </p>

            <div className="car" aria-hidden="true">
              🚕
            </div>
          </div>
        </section>

        {error && (
          <div className="error-message page-message" role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div className="success-message page-message" role="status">
            {notice}
          </div>
        )}

        {/* Admin statistics are shown only to admins. */}
        {isAdmin && (
          <section className="dashboard">
            <div className="dashboard-heading">
              <div>
                <span className="tag">CABGO MANAGEMENT</span>
                <h2>Admin Dashboard</h2>
                <p className="dashboard-subtitle">
                  Overview of all ride bookings
                </p>
              </div>

              <button
                className="refresh-button"
                onClick={() => loadRides(token, true)}
                disabled={loading}
              >
                ↻ {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            <div className="stats-grid">
              <StatCard
                icon="🚕"
                label="Total Bookings"
                value={stats.total}
              />
              <StatCard
                icon="⏳"
                label="Pending Rides"
                value={stats.pending}
              />
              <StatCard
                icon="🚘"
                label="Confirmed Rides"
                value={stats.confirmed}
              />
              <StatCard
                icon="✅"
                label="Completed Rides"
                value={stats.completed}
              />
              <StatCard
                icon="❌"
                label="Cancelled Rides"
                value={stats.cancelled}
              />
              <StatCard
                icon="₹"
                label="Completed Ride Fare"
                value={formatFare(stats.revenue)}
                revenue
              />
            </div>
          </section>
        )}

        {/* Booking form is now visible to both users and admins. */}
        <section className="dashboard" id="book-ride">
          <div className="dashboard-heading">
            <div>
              <span className="tag">START YOUR JOURNEY</span>
              <h2>Book Your Ride</h2>
              <p className="dashboard-subtitle">
                Enter your trip details to create a new booking.
              </p>
            </div>
          </div>

          <div className="booking-card">
            <form
              className="booking-form"
              onSubmit={handleBookRide}
            >
              <div className="form-grid">
                <label>
                  Pickup Location
                  <input
                    name="pickup_location"
                    value={booking.pickup_location}
                    onChange={updateBookingField}
                    placeholder="e.g. Pimpri"
                    required
                  />
                </label>

                <label>
                  Drop Location
                  <input
                    name="drop_location"
                    value={booking.drop_location}
                    onChange={updateBookingField}
                    placeholder="e.g. Pune"
                    required
                  />
                </label>

                <label>
                  Passenger Name
                  <input
                    name="passenger_name"
                    value={booking.passenger_name}
                    onChange={updateBookingField}
                    placeholder="Enter passenger name"
                    required
                  />
                </label>

                <label>
                  Fare (₹)
                  <input
                    name="fare"
                    type="number"
                    min="1"
                    step="0.01"
                    value={booking.fare}
                    onChange={updateBookingField}
                    placeholder="Enter fare"
                    required
                  />
                </label>
              </div>

              <button
                type="submit"
                className="primary-button book-button"
                disabled={bookingLoading}
              >
                {bookingLoading
                  ? "Booking..."
                  : "🚕 Book Ride"}
              </button>
            </form>
          </div>
        </section>

        <section className="history">
          <div className="history-heading">
            <div>
              <span className="tag">MANAGEMENT</span>
              <h2>
                {isAdmin ? "All Bookings" : "My Bookings"}
              </h2>
            </div>

            <button
              className="refresh-button"
              onClick={() => loadRides(token, isAdmin)}
              disabled={loading}
            >
              ↻ {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <p className="history-info">
            Welcome to CabGo, {user.username || user.email}!
          </p>

          {loading && rides.length === 0 ? (
            <p className="empty-state">Loading bookings...</p>
          ) : rides.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🚕</div>
              <h3>No rides yet</h3>
              <p>
                {isAdmin
                  ? "No bookings have been created yet."
                  : "Use the Book Your Ride form above to create your first booking."}
              </p>
            </div>
          ) : (
            <div className="ride-list">
              {rides.map((ride) => {
                const status = normalizeStatus(ride.status);
                const active = [
                  "pending",
                  "confirmed",
                ].includes(status);

                const isOwner =
                  Number(ride.user_id) === Number(user.id);

                return (
                  <article
                    className="ride-card"
                    key={ride.id}
                  >
                    <div className="ride-top">
                      <span className="ride-id">
                        Booking #{ride.id}
                      </span>

                      <span className={`status status-${status}`}>
                        {ride.status || "Pending"}
                      </span>
                    </div>

                    {isAdmin && (
                      <p className="booking-owner">
                        Passenger: {ride.passenger_name}
                      </p>
                    )}

                    <div className="ride-route">
                      <div className="route-point">
                        <span className="route-dot pickup-dot" />
                        <div>
                          <span>Pickup Location</span>
                          <strong>{ride.pickup_location}</strong>
                        </div>
                      </div>

                      <div className="route-point">
                        <span className="route-dot drop-dot" />
                        <div>
                          <span>Drop Location</span>
                          <strong>{ride.drop_location}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="ride-bottom">
                      <div>
                        <strong>{ride.passenger_name}</strong>
                        <p>{formatFare(ride.fare)}</p>
                      </div>

                      <div className="ride-actions">
                        {isAdmin && status === "pending" && (
                          <button
                            className="confirm-button"
                            onClick={() =>
                              updateRideStatus(
                                ride.id,
                                "Confirmed"
                              )
                            }
                          >
                            Confirm
                          </button>
                        )}

                        {isAdmin && status === "confirmed" && (
                          <button
                            className="complete-button"
                            onClick={() =>
                              updateRideStatus(
                                ride.id,
                                "Completed"
                              )
                            }
                          >
                            Complete
                          </button>
                        )}

                        {!isAdmin && isOwner && active && (
                          <button
                            className="cancel-button"
                            onClick={() =>
                              updateRideStatus(
                                ride.id,
                                "Cancelled"
                              )
                            }
                          >
                            Cancel Ride
                          </button>
                        )}

                        {(isAdmin ||
                          (isOwner && status === "pending")) && (
                          <button
                            className="delete-button"
                            onClick={() => deleteRide(ride.id)}
                          >
                            🗑 Delete Booking
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        © 2026 CabGo — Your ride, your way.
      </footer>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  revenue = false,
}) {
  return (
    <div className={`stat-card ${revenue ? "revenue-card" : ""}`}>
      <span className="stat-icon">{icon}</span>
      <p>{label}</p>
      <h3>{value}</h3>
    </div>
  );
}

export default App;









