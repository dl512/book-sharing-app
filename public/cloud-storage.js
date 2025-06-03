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

// Function to upload a file to Google Cloud Storage
async function uploadToCloud(file) {
  try {
    const safeFileName = generateSafeFileName(file.name);
    const { signedUrl, publicUrl } = await getSignedUrl(
      safeFileName,
      file.type
    );
    await fetch(signedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });
    return publicUrl;
  } catch (error) {
    console.error("Error uploading to cloud:", error);
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
