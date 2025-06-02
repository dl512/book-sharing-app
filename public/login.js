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

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Login failed");
    }

    // Store the token
    localStorage.setItem("token", result.token);

    // Redirect to sharing page
    window.location.href = "sharing.html";
  } catch (error) {
    console.error("Login error:", error);
    alert("Login failed: " + error.message);
  }
});
