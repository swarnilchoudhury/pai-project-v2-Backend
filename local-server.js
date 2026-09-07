const app = require("./src/app");

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
    console.log(`PAI backend running at http://localhost:${port}`);
    console.log(`Swagger UI: http://localhost:${port}/api-docs`);
});
