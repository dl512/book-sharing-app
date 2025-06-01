// Handle photo preview
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photo-preview");
let selectedPhoto = null;

photoInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    selectedPhoto = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      photoPreview.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`;
    };
    reader.readAsDataURL(file);
  }
});

// Handle registration
document
  .getElementById("register-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("register-userid").value;
    const password = document.getElementById("register-password").value;
    const books = getBooksFromForm();

    try {
      // First, upload the photo if one was selected
      let photoUrl = null;
      if (selectedPhoto) {
        photoUrl = await uploadToCloud(selectedPhoto);
      }

      // Then register the user with the photo URL
      const response = await fetch(
        "https://book-sharing-app.onrender.com/api/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            password,
            books,
            photoUrl,
          }),
        }
      );

      if (response.ok) {
        // Get the token from the response
        const data = await response.json();
        localStorage.setItem("token", data.token);
        window.location.href = "sharing.html";
      } else {
        const error = await response.text();
        alert("Registration failed: " + error);
      }
    } catch (error) {
      console.error("Registration error:", error);
      alert("Registration failed: " + error.message);
    }
  });
