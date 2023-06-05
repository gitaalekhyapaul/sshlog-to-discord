import express, { Request, Response, NextFunction } from "express";
import { config } from "dotenv";
import axios from "axios";
import bull, { Queue } from "bull";
config();
interface Job {
  event_type: string;
  message: string;
  timestamp: number;
  username?: string;
}
class JobService {
  private static queue: Queue<Job> | null = null;
  private constructor() {}
  public static initService = () => {
    this.queue = new bull<Job>(
      "sshlogs-to-discord-job-queue",
      process.env.REDIS_QUEUE!,
      {
        limiter: {
          max: 4,
          duration: 1000,
          bounceBack: true,
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: true,
        },
      }
    );
    this.queue.process(async (job) => {
      const { event_type, message, timestamp, username } = job.data;
      const formattedDate = new Date(timestamp).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "long",
        timeStyle: "medium",
      });
      return axios.post(process.env.DISCORD_WEBHOOK_URL!, {
        content: `**SSH Logs${username !== "" ? `[${username}]` : ""}:**
\`${event_type}\` fired at **\`${formattedDate} IST\`:**
\`\`\`${message}\`\`\``,
        username: `Server [${process.env.SERVER_NAME ?? "website"}] SSH Logs`,
        avatar_url:
          process.env.SERVER_LOGO ?? "https://github.com/gitaalekhyapaul.png",
      });
    });
  };
  public static addJob(job: Job) {
    if (this.queue) {
      return this.queue.add(job);
    } else {
      this.initService();
      return this.queue!.add(job);
    }
  }
}

const app = express();

app.use((req: Request, res: Response, next: NextFunction) => {
  const { "content-type": contentType } = req.headers;
  if (contentType !== "application/x-www-form-urlencoded") {
    return res.status(415).json({
      success: false,
      message: "Only url-encoded content-type is supported.",
    });
  }
  next();
});

app.use(express.urlencoded({ extended: true }));
app.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { apiKey } = req.query;
    if (apiKey !== process.env.API_KEY) {
      throw {
        returnCode: 400,
        message: "API key not verified.",
      };
    }
    const { event_type, username } = req.body;
    let message = "";
    switch (event_type) {
      case "connection_established": {
        const { user_id, username } = req.body;
        message = `User ${username}:${user_id} has connected to the SSH server.`;
        break;
      }
      case "connection_close": {
        const { user_id, username, shell_id } = req.body;
        if (user_id !== "-1" && shell_id !== "-1") {
          message = `User ${username}:${user_id} has disconnected from the SSH server.`;
        }
        break;
      }
      case "command_start": {
        const { username, args } = req.body;
        message = `User ${username} executed:
${args}`;
        break;
      }
      default: {
        message = `Unknown event received:
${JSON.stringify(req.body, null, 4)}`;
      }
    }
    if (event_type?.length > 0 && message.length > 0) {
      Promise.all([
        JobService.addJob({
          event_type: event_type,
          message: message,
          timestamp: Date.now(),
          username: username ?? "",
        }),
      ]).catch((e) => console.error(e));
    }
    res.status(200).json({
      success: true,
      message: "Message queued.",
    });
  } catch (err) {
    next(err);
  }
});
app.use("*", (req: Request, res: Response, next: NextFunction) => {
  res.status(405).json({
    success: false,
    message: "Method not allowed.",
  });
});
app.use((err: Error | any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  if (err?.returnCode) {
    res.status(err.returnCode).json({
      success: false,
      message: err.message,
    });
  } else {
    res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
});

Promise.all([JobService.initService()])
  .then((_) => {
    app.listen(process.env.PORT!, () => {
      console.log(`Server listening on Port ${process.env.PORT}`);
    });
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

process.on("SIGHUP", () => {
  process.exit(1);
});
process.on("SIGINT", () => {
  process.exit(1);
});
