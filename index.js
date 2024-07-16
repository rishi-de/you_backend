import express from "express";
import youtube from "youtube-api";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import open from "open";
import axios from "axios";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import credentials from "./credentials.json" assert { type: "json" };

const PORT = 3001;

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
  const { title, description, link, option } = req.body;

  if (link) {
    try {
      const response = await axios.get(link, { responseType: "stream" });

      const videoPath = `./uploads/${uuidv4()}.mp4`;
      const writer = fs.createWriteStream(videoPath);

      response.data.pipe(writer);

      writer.on("finish", () => {
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
      console.error("Error fetching file from link:", error);
      res.status(500).json({ error: "Error fetching file from link" });
    }
  } else {
    uploadVideoFile(req, res, (err) => {
      if (err) {
        console.error("Error uploading file:", err);
        return res.status(500).json({ error: "Error uploading file" });
      }

      const filename = req.file.filename;
      handleFileUpload(req, res, title, description, filename);
    });
  }
});

const handleFileUpload = (req, res, title, description, filename) => {
  if (!filename) {
    console.error("Filename is undefined");
    return res.status(400).json({ error: "Filename is undefined" });
  }

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

  open(authUrl);
};

app.get("/oauth2callback", (req, res) => {
  console.log("OAuth2 callback hit");
  res.redirect("http://localhost:5173/success");

  const { filename, title, description } = JSON.parse(req.query.state);
  const code = req.query.code;

  if (!filename) {
    console.error("Filename is undefined in OAuth2 callback");
    return res.status(400).json({ error: "Filename is undefined" });
  }

  oAuth.getToken(
    { code, redirect_uri: credentials.web.redirect_uris[0] },
    (err, tokens) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Error getting tokens.");
      }

      oAuth.setCredentials(tokens);

      youtube.videos.insert(
        {
          resource: {
            snippet: { title, description },
            status: { privacyStatus: "public" },
          },
          part: "snippet,status",
          media: {
            body: fs.createReadStream(`./uploads/${filename}`),
          },
        },
        (err, data) => {
          if (err) {
            console.log(err);
            return res.status(500).send("Error uploading video.");
          }

          console.log("Video uploaded successfully.");
          process.exit();
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
