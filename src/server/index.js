import http from "node:http";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const server = http.createServer(createApp());

server.listen(port, () => {
  console.log(`On-Call Assistant listening on http://localhost:${port}`);
});
