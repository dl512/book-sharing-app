// Handle book photo preview
const bookPhotoInput = document.getElementById("book-photo");
const bookPhotoPreview = document.getElementById("book-photo-preview");
let selectedBookPhoto = null;
let books = [];

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
document.getElementById("add-book").addEventListener("click", async () => {
  const title = document.getElementById("book-title").value;
  const author = document.getElementById("book-author").value;
  const description = document.getElementById("book-description").value;
  const sharingOptions = {
    forSale: document.getElementById("forSale").checked,
    forExchange: document.getElementById("forExchange").checked,
    forBorrow: document.getElementById("forBorrow").checked,
    forDiscussion: document.getElementById("forDiscussion").checked,
  };

  if (!title || !author || !description) {
    alert("Please fill in all book details");
    return;
  }

  try {
    // Store the book data with the photo file for later upload
    const book = {
      title,
      author,
      description,
      sharingOptions,
      photoFile: selectedBookPhoto, // Store the file object for later upload
    };

    console.log("Adding book with data:", {
      ...book,
      photoFile: book.photoFile ? "File present" : "No file",
    });
    books.push(book);

    // Show preview with local file URL
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

    // If all books are added, proceed with photo uploads and registration
    if (currentBook > totalBooks) {
      console.log("\nAll books added, starting photo uploads...");

      // Upload all book photos
      for (let book of books) {
        if (book.photoFile) {
          console.log(`Uploading photo for book: ${book.title}`);
          book.photoUrl = await uploadToCloud(book.photoFile);
          console.log(`Photo uploaded successfully. URL: ${book.photoUrl}`);
          delete book.photoFile; // Remove the file object before sending to server
        }
      }

      // Store user data and books
      const userData = {
        userId: document.getElementById("register-userid").value,
        password: document.getElementById("register-password").value,
        books: books,
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

        const result = await response.text();
        console.log("\nRegistration response:", result);

        if (!response.ok) {
          throw new Error(result || "Registration failed");
        }

        alert(result);
        window.location.href = "login.html";
      } catch (error) {
        console.error("\nRegistration error:", error);
        alert("Registration failed: " + error.message);
      }
    }
  } catch (error) {
    console.error("Error adding book:", error);
    alert("Error adding book: " + error.message);
  }
});
