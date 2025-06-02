// Handle login form submission
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const userId = document.getElementById("login-userid").value;
  const password = document.getElementById("login-password").value;

  try {
    const response = await fetch(
      "https://book-sharing-app.onrender.com/api/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, password }),
      }
    );

    // If fetch fails (network error), this block is skipped and goes to catch
    let result = null;
    try {
      result = await response.json();
    } catch (jsonErr) {
      // If response is not JSON, treat as error
      throw new Error("Invalid server response");
    }

    if (!response.ok) {
      throw new Error(result.message || "Login failed");
    }

    // Only store token and redirect if login is successful
    if (result.token) {
      localStorage.setItem("token", result.token);
      window.location.href = "sharing.html";
    } else {
      throw new Error("No token received");
    }
  } catch (error) {
    console.error("Login error:", error);
    alert("Login failed: " + error.message);
  }
});
