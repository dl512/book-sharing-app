// Shared variables
let currentBook = 1;
const totalBooks = 3;
let books = [];
let pendingPhotos = []; // Store photos temporarily

// Loading indicator functions
function showLoading(message) {
  const overlay = document.getElementById("loading-overlay");
  const progressText = document.getElementById("loading-progress");
  overlay.style.display = "flex";
  progressText.textContent = message;
}

function hideLoading() {
  const overlay = document.getElementById("loading-overlay");
  overlay.style.display = "none";
}

function updateLoadingProgress(message) {
  const progressText = document.getElementById("loading-progress");
  progressText.textContent = message;
}

// Update progress bar
function updateProgress() {
  const progress = (currentBook / totalBooks) * 100;
  document.getElementById("progress-bar").style.width = `${progress}%`;
  document.getElementById(
    "book-counter"
  ).textContent = `Book ${currentBook} of ${totalBooks}`;
}

// Handle next button click
document.getElementById("next-to-books").addEventListener("click", () => {
  const userId = document.getElementById("register-userid").value;
  const password = document.getElementById("register-password").value;

  if (!userId || !password) {
    alert("Please fill in all fields");
    return;
  }

  // Show progress bar and book counter
  document.querySelector(".progress-bar").style.display = "block";
  document.getElementById("book-counter").style.display = "block";

  document.getElementById("user-section").classList.remove("active");
  document.getElementById("book-section").classList.add("active");

  // Initialize progress
  updateProgress();
});

// Handle book photo preview
const bookPhotoInput = document.getElementById("book-photo");
const bookPhotoPreview = document.getElementById("book-photo-preview");
let selectedBookPhoto = null;

console.log("Register.js loaded");

bookPhotoInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    selectedBookPhoto = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      bookPhotoPreview.innerHTML = `
        <img src="${e.target.result}" alt="Book Preview" style="max-width: 100%; height: auto; border-radius: 4px;">
      `;
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
      // Register the user
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

// Handle add book button click
const addBookButton = document.getElementById("add-book");
console.log("Add book button found:", addBookButton);

addBookButton.addEventListener("click", async () => {
  console.log("Add book button clicked");

  const title = document.getElementById("book-title").value;
  const author = document.getElementById("book-author").value;
  const description = document.getElementById("book-description").value;
  const sharingOptions = {
    forSale: document.getElementById("forSale").checked,
    forExchange: document.getElementById("forExchange").checked,
    forBorrow: document.getElementById("forBorrow").checked,
    forDiscussion: document.getElementById("forDiscussion").checked,
  };

  console.log("Form values:", { title, author, description, sharingOptions });
  console.log(
    "Selected photo:",
    selectedBookPhoto ? "Photo selected" : "No photo selected"
  );

  if (!title || !author || !description) {
    alert("Please fill in all book details");
    return;
  }

  try {
    // Create book object with temporary photo data
    const book = {
      title,
      author,
      description,
      sharingOptions,
      photoFile: selectedBookPhoto, // Store the file object temporarily
    };

    console.log("Adding book with data:", book);
    books.push(book);

    // Show preview with the temporary photo
    const preview = document.createElement("div");
    preview.className = "book-preview";
    preview.innerHTML = `
      <h3>${book.title}</h3>
      <p>by ${book.author}</p>
      <p>${book.description}</p>
      ${
        selectedBookPhoto
          ? `<img src="${URL.createObjectURL(selectedBookPhoto)}" alt="${
              book.title
            }" style="max-width: 200px; margin-top: 10px;">`
          : ""
      }
    `;
    document.getElementById("books-preview").appendChild(preview);

    // Clear form
    document.getElementById("book-title").value = "";
    document.getElementById("book-author").value = "";
    document.getElementById("book-description").value = "";
    document.getElementById("forSale").checked = false;
    document.getElementById("forExchange").checked = false;
    document.getElementById("forBorrow").checked = false;
    document.getElementById("forDiscussion").checked = false;
    document.getElementById("book-photo").value = "";
    bookPhotoPreview.innerHTML = "";
    selectedBookPhoto = null;

    // Update progress
    currentBook++;
    updateProgress();

    // If all books are added, proceed with registration
    if (currentBook > totalBooks) {
      showLoading("Creating your account...");

      // First register the user without photos
      const userData = {
        userId: document.getElementById("register-userid").value,
        password: document.getElementById("register-password").value,
        books: books.map((book) => ({
          ...book,
          photoFile: undefined, // Remove file objects before sending
        })),
      };

      console.log(
        "\nSending registration data:",
        JSON.stringify(userData, null, 2)
      );

      try {
        // Send registration request
        const response = await fetch(
          "https://book-sharing-app.onrender.com/api/auth/register",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(userData),
          }
        );

        let result;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          result = await response.json();
          console.log("Registration response (parsed JSON):", result);
        } else {
          result = await response.text();
          console.log("Registration response (text):", result);
          throw new Error("Invalid response format from server");
        }

        if (!response.ok) {
          throw new Error(
            typeof result === "string"
              ? result
              : result.message || "Registration failed"
          );
        }

        // Store the token
        if (typeof result === "object" && result.token) {
          localStorage.setItem("token", result.token);
          console.log("Token stored:", result.token);
        } else {
          throw new Error("No authentication token received");
        }

        // Fetch user's books after registration
        console.log("Fetching user's books...");
        const booksResponse = await fetch(
          "https://book-sharing-app.onrender.com/api/books",
          {
            headers: {
              Authorization: `Bearer ${result.token}`,
            },
          }
        );

        if (!booksResponse.ok) {
          throw new Error("Failed to fetch user's books");
        }

        const userBooks = await booksResponse.json();
        console.log("User's books:", userBooks);

        if (!userBooks || !Array.isArray(userBooks)) {
          throw new Error("Invalid books data received");
        }

        // Now upload photos for each book
        const totalPhotos = books.filter((book) => book.photoFile).length;
        let uploadedPhotos = 0;

        for (let i = 0; i < books.length; i++) {
          const book = books[i];
          if (book.photoFile) {
            try {
              updateLoadingProgress(
                `Uploading photo ${uploadedPhotos + 1} of ${totalPhotos}...`
              );
              console.log(
                `\n=== Uploading photo for book ${i + 1}: ${book.title} ===`
              );

              // Get signed URL
              const { signedUrl, publicUrl } = await getSignedUrl(
                `${Date.now()}-${book.photoFile.name}`,
                book.photoFile.type
              );

              console.log("Received signed URL:", signedUrl);
              console.log("Received public URL:", publicUrl);

              // Upload the file
              const uploadResponse = await fetch(signedUrl, {
                method: "PUT",
                headers: {
                  "Content-Type": book.photoFile.type,
                },
                body: book.photoFile,
              });

              if (!uploadResponse.ok) {
                throw new Error("Failed to upload photo");
              }

              console.log("File uploaded successfully to Google Cloud Storage");

              // Find the matching book in userBooks by title
              const matchingBook = userBooks.find(
                (b) => b.title === book.title
              );
              if (!matchingBook || !matchingBook._id) {
                console.error(
                  `No matching book found for "${book.title}". Available books:`,
                  userBooks
                );
                throw new Error(
                  `Could not find book "${book.title}" in user's books`
                );
              }

              updateLoadingProgress(`Saving photo URL for book ${i + 1}...`);
              console.log(
                `Updating book ${matchingBook._id} with photo URL: ${publicUrl}`
              );

              // Update book photo URL in the database
              const updateResponse = await fetch(
                `https://book-sharing-app.onrender.com/api/books/${matchingBook._id}/photo`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${result.token}`,
                  },
                  body: JSON.stringify({ photoUrl: publicUrl }),
                }
              );

              if (!updateResponse.ok) {
                const errorText = await updateResponse.text();
                console.error(
                  "Failed to update book photo URL. Response:",
                  errorText
                );
                throw new Error(
                  `Failed to update book photo URL: ${errorText}`
                );
              }

              const updateResult = await updateResponse.json();
              console.log(
                `Photo URL updated successfully for book ${i + 1}:`,
                updateResult
              );
              uploadedPhotos++;
            } catch (error) {
              console.error(`Error uploading photo for book ${i + 1}:`, error);
              console.error("Error details:", error.message);
              console.error("Stack trace:", error.stack);
              throw error; // Re-throw to stop the process if a photo fails
            }
          }
        }

        hideLoading();
        alert("Registration successful!");
        window.location.href = "login.html";
      } catch (error) {
        hideLoading();
        console.error("\nRegistration error:", error);
        alert("Registration failed: " + error.message);
      }
    }
  } catch (error) {
    console.error("Error adding book:", error);
    alert("Error adding book: " + error.message);
  }
});
