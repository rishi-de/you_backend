const express = require("express");
const youtube = require("youtube-api");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const credentials = require("./credentials.json");

const PORT = 3001;

(async () => {
  const open = (await import("open")).default; // Dynamic import for `open`

  const app = express();

  app.use(express.json());
  app.use(cors());

  const storage = multer.diskStorage({
    destination: "./uploads", // Ensure this directory exists
    filename(req, file, cb) {
      const newFilename = `${uuidv4()}-${file.originalname}`;
      cb(null, newFilename);
    },
  });

  const uploadVideoFile = multer({
    storage: storage,
  }).single("videoFile");

  app.post("/upload", async (req, res) => {
    const { title, description, presignedUrl } = req.body;

    console.log("Received upload request.");
    console.log("Presigned URL:", presignedUrl);

    if (presignedUrl) {
      try {
        console.log("Fetching file from presigned URL...");

        const response = await axios.get(presignedUrl, {
          responseType: "stream",
        });

        const videoPath = `./uploads/${uuidv4()}.mp4`;
        const writer = fs.createWriteStream(videoPath);

        response.data.pipe(writer);

        writer.on("finish", () => {
          console.log("File fetched and saved successfully.");

          req.file = {
            path: videoPath,
            originalname: path.basename(videoPath),
          };

          handleFileUpload(
            req,
            res,
            title,
            description,
            path.basename(videoPath)
          );
        });

        writer.on("error", (error) => {
          console.error("Error writing file:", error);
          res.status(500).json({ error: "Error writing file" });
        });
      } catch (error) {
        console.error("Error fetching file from link:", error.message);
        res.status(500).json({ error: "Error fetching file from link" });
      }
    } else {
      uploadVideoFile(req, res, (err) => {
        if (err) {
          console.error("Error uploading file:", err.message);
          return res.status(500).json({ error: "Error uploading file" });
        }

        const filename = req.file.filename;
        console.log("File uploaded successfully:", filename);
        handleFileUpload(req, res, title, description, filename);
      });
    }
  });

  const handleFileUpload = (req, res, title, description, filename) => {
    if (!filename) {
      console.error("Filename is undefined");
      return res.status(400).json({ error: "Filename is undefined" });
    }

    console.log("Generating OAuth URL...");
    const authUrl = oAuth.generateAuthUrl({
      access_type: "offline",
      scope: "https://www.googleapis.com/auth/youtube.upload",
      state: JSON.stringify({
        filename,
        title,
        description,
      }),
      redirect_uri: credentials.web.redirect_uris[0], // Ensure redirect_uri is included here
    });

    console.log("OAuth URL:", authUrl);

    // Attempt to open OAuth URL
    open(authUrl).then(() => {
      console.log("OAuth URL opened successfully.");
    }).catch((err) => {
      console.error("Error opening OAuth URL:", err.message);
      res.status(500).json({ error: "Error opening OAuth URL" });
    });
  };

  app.get("/oauth2callback", (req, res) => {
    const { state, code } = req.query;

    if (!state || !code) {
      console.error("Missing state or code in OAuth2 callback");
      return res.status(400).json({ error: "Missing state or code" });
    }

    console.log("OAuth2 callback received.");
    const { filename, title, description } = JSON.parse(state);

    if (!filename) {
      console.error("Filename is undefined in OAuth2 callback");
      return res.status(400).json({ error: "Filename is undefined" });
    }

    oAuth.getToken(
      { code, redirect_uri: credentials.web.redirect_uris[0] },
      (err, tokens) => {
        if (err) {
          console.error("Error getting tokens:", err.message);
          return res.status(500).send("Error getting tokens.");
        }

        console.log("Tokens retrieved successfully.");
        oAuth.setCredentials(tokens);

        youtube.videos.insert(
          {
            resource: {
              snippet: { title, description },
              status: { privacyStatus: "private" },
            },
            part: "snippet,status",
            media: {
              body: fs.createReadStream(`./uploads/${filename}`),
            },
          },
          (err, data) => {
            if (err) {
              console.error("Error uploading video:", err.message);
              return res.status(500).send("Error uploading video.");
            }

            console.log("Video uploaded successfully.");

            // Delete the file after upload
            fs.unlink(`./uploads/${filename}`, (unlinkErr) => {
              if (unlinkErr) {
                console.error("Error deleting file:", unlinkErr.message);
              } else {
                console.log("File deleted successfully.");
              }
            });

            res.send("Video uploaded and file deleted successfully.");
          }
        );
      }
    );
  });

  const oAuth = youtube.authenticate({
    type: "oauth",
    client_id: credentials.web.client_id,
    client_secret: credentials.web.client_secret,
    redirect_uri: credentials.web.redirect_uris[0], // Ensure redirect_uri is included here
  });

  app.listen(PORT, () => {
    console.log(`The app is listening on port ${PORT}`);
  });
})();
