import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const localEnv = join(homedir(), ".remember-when", ".env");
if (existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
} else {
  dotenv.config();
}
import cors from "cors";
import express from "express";
import multer from "multer";
import { requireAuth } from "./auth";
import { handleDeleteAnswer, handleGetInterview, handleHealth, handlePostAnswer } from "./handlers";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 35 * 1024 * 1024
  }
});

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res, next) => {
  try {
    res.json(await handleHealth());
  } catch (error) {
    next(error);
  }
});

async function requireAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const auth = await requireAuth(req.headers.authorization, `${req.protocol}://${req.get("host")}${req.originalUrl}`);
  if ("status" in auth) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }
  res.locals.userEmail = auth.email;
  next();
}

app.use("/api", requireAuthMiddleware);

app.get("/api/interview", async (req, res, next) => {
  try {
    res.json(await handleGetInterview(String(res.locals.userEmail)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/responses/:questionId/answer", upload.single("audio"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "An audio file is required." });
      return;
    }

    const result = await handlePostAnswer(String(res.locals.userEmail), {
      questionId: String(req.params.questionId),
      audioBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalFilename: req.file.originalname,
      sourceByteLength: req.file.size
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/responses/:questionId/answer", async (req, res, next) => {
  try {
    const result = await handleDeleteAnswer(String(res.locals.userEmail), String(req.params.questionId));
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, "127.0.0.1", () => {
  console.log(`Remember When API listening on http://127.0.0.1:${port}`);
});
