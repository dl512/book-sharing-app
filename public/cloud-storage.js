// Google Cloud Storage configuration
const BUCKET_NAME = "book-sharing-app-images";
const API_ENDPOINT = "https://storage.googleapis.com";

// Function to get a signed URL for uploading
async function getSignedUrl(fileName, fileType) {
  try {
    console.log("Getting signed URL for:", { fileName, fileType });

    const token = localStorage.getItem("token");
    if (!token) {
      throw new Error("No authentication token found");
    }

    console.log("Making request to server for signed URL...");
    const response = await fetch(
      "https://book-sharing-app.onrender.com/api/upload/signed-url",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName,
          fileType,
        }),
      }
    );

    console.log("Signed URL response status:", response.status);
    console.log(
      "Response headers:",
      Object.fromEntries(response.headers.entries())
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error response:", errorData);
      throw new Error(errorData.message || "Failed to get signed URL");
    }

    const data = await response.json();
    console.log("Received signed URL data:", data);

    // Handle both response formats (url or signedUrl)
    const signedUrl = data.signedUrl || data.url;
    if (!signedUrl) {
      console.error("No signed URL in response:", data);
      throw new Error("Server did not return a signed URL");
    }

    // If we got a url instead of signedUrl, construct the publicUrl
    const publicUrl = data.publicUrl || signedUrl;

    return { signedUrl, publicUrl };
  } catch (error) {
    console.error("Error getting signed URL:", error);
    throw error;
  }
}

// Function to upload file to Google Cloud Storage
async function uploadToCloud(file) {
  try {
    console.log("\n=== Starting File Upload ===");
    console.log("File details:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Check authentication
    const token = localStorage.getItem("token");
    console.log("Auth token present:", !!token);

    // Generate a unique file name
    const fileName = `${Date.now()}-${file.name.replace(
      /[^a-zA-Z0-9.-]/g,
      "_"
    )}`;
    console.log("Generated file name:", fileName);

    // Get signed URL
    console.log("Requesting signed URL...");
    const { signedUrl, publicUrl } = await getSignedUrl(fileName, file.type);
    console.log("Got signed URL:", signedUrl);
    console.log("Got public URL:", publicUrl);

    if (!signedUrl) {
      throw new Error("No signed URL received from server");
    }

    // Upload file using signed URL
    console.log("Uploading file to signed URL...");
    const uploadResponse = await fetch(signedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    console.log("Upload response status:", uploadResponse.status);
    console.log(
      "Upload response headers:",
      Object.fromEntries(uploadResponse.headers.entries())
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Upload error response:", errorText);
      throw new Error("Failed to upload file");
    }

    console.log("File uploaded successfully. Public URL:", publicUrl);
    console.log("=== File Upload Complete ===\n");
    return publicUrl;
  } catch (error) {
    console.error("\n=== Error Uploading to Cloud ===");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    console.error("=============================\n");
    throw error;
  }
}

// Function to delete file from Google Cloud Storage
async function deleteFromCloud(fileUrl) {
  try {
    console.log("Deleting file:", fileUrl);

    const token = localStorage.getItem("token");
    if (!token) {
      throw new Error("No authentication token found");
    }

    const fileName = fileUrl.split("/").pop();
    console.log("Extracted file name:", fileName);

    const response = await fetch(
      `https://book-sharing-app.onrender.com/api/upload/${fileName}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log("Delete response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Delete error response:", errorData);
      throw new Error(errorData.message || "Failed to delete file");
    }

    console.log("File deleted successfully");
    return true;
  } catch (error) {
    console.error("Error deleting from cloud:", error);
    throw error;
  }
}
