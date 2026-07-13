export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(indexHtml(), {
        headers: {
          "content-type": "text/html;charset=UTF-8"
        }
      });
    }

    if (url.pathname === "/api/status") {
      const meta = await env.KB.get("kb:meta");

      return Response.json(
        meta
          ? JSON.parse(meta)
          : {
              indexed: false,
              pages: 0
            }
      );
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChat(request, env);
    }

    if (url.pathname === "/api/reindex" && request.method === "POST") {
      return reindex(env);
    }

    return new Response("Not Found", {
      status: 404
    });
  }
};

async function handleChat(request, env) {
  const body = await request.json();

  const question = body.message || "";

  const kb =
  (await env.KB.get("knowledge")) || "";

const context = kb
  .split("----------------------------------------")
  .filter(x =>
    x.toLowerCase().includes(question.toLowerCase())
  )
  .slice(0,8)
  .join("\n----------------------------------------\n");

  if (!kb) {
    return Response.json({
      error: "Knowledge base is empty. Run /api/reindex first."
    });
  }

  const prompt = `
You are NH AI.

Answer ONLY using the following knowledge.

${context || kb.substring(0,12000)}

Question:
${question}
`;

  try {

    const ai = await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      }
    );

    return Response.json({
      reply: ai.response
    });

  } catch (e) {

    return Response.json({
      error: e.message
    });

  }

}

async function reindex(env) {

  const base = env.SITE_URL;

  const endpoints = [
    "posts",
    "pages"
  ];

  const knowledge = [];

  for (const type of endpoints) {

    let page = 1;

    while (true) {

      const res = await fetch(
        `${base}/wp-json/wp/v2/${type}?per_page=100&page=${page}`
      );

      if (!res.ok) break;

      const items = await res.json();

      if (!items.length) break;

      for (const item of items) {

        const title =
          item.title?.rendered || "";

        const content =
          stripHtml(
            item.content?.rendered || ""
          );

        knowledge.push(
`TITLE:
${title}

CONTENT:
${content}

----------------------------------------
`);
      }

      page++;

    }

  }

  await env.KB.put(
    "knowledge",
    knowledge.join("\n")
  );

  await env.KB.put(
    "kb:meta",
    JSON.stringify({
      indexed: true,
      pages: knowledge.length,
      updated: new Date().toISOString()
    })
  );

  return Response.json({
    success: true,
    pages: knowledge.length
  });

}

function stripHtml(html) {

  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

}

function indexHtml() {

return `<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>NH AI</title>

<style>

body{

margin:0;

background:#10131a;

color:white;

font-family:Arial;

display:flex;

flex-direction:column;

height:100vh;

}

#chat{

flex:1;

overflow:auto;

padding:20px;

}

#bar{

display:flex;

padding:10px;

background:#1b2230;

}

input{

flex:1;

padding:12px;

border-radius:10px;

border:none;

}

button{

margin-left:10px;

padding:12px 20px;

border:none;

border-radius:10px;

cursor:pointer;

}

.msg{

margin:15px 0;

white-space:pre-wrap;

}

.user{

color:#8fd3ff;

}

.ai{

color:#ffffff;

}

</style>

</head>

<body>

<div id="chat"></div>

<div id="bar">

<input id="q" placeholder="Ask NH AI...">

<button onclick="ask()">Send</button>

</div>

<script>

async function ask(){

const input=document.getElementById("q");

const text=input.value.trim();

if(!text)return;

chat.innerHTML+=
'<div class="msg user">'+text+'</div>';

input.value='';

const r=await fetch("/api/chat",{

method:"POST",

headers:{
"content-type":"application/json"
},

body:JSON.stringify({
message:text
})

});

const d=await r.json();

chat.innerHTML+=
'<div class="msg ai">'+
(d.reply||d.error)+
'</div>';

chat.scrollTop=chat.scrollHeight;

}

</script>

</body>

</html>`;

}