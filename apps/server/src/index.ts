import { createApp } from './app';

const port = Number(process.env.PORT ?? 3001);
const { http } = createApp();
http.listen(port, () => {
  console.log(`Risky Chess server listening on :${port}`);
});
