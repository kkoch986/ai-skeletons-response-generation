const express = require("express");
const CharacterAI = require("node_characterai");
// @ts-ignore
import { parseArgs } from "node:util";
const characterAI = new CharacterAI();

type Response = {
  id: string,
  characterId: string,
  chatId: string,
  imageRelativePath: string|null,
  srcName: string,
  text: string,
};

type Message = {
  role: string,
  content: string,
};

interface Backend {
  start(): Promise<Response>,
  receive(message:string): Promise<Response>,
};

// OLlama backend is backed by ollama
// the assumption is that relevant models have already been pulled
class OLlamaBackend implements Backend {
  private baseURL:string;
  private model:string;
  private systemPrompts:string[];
  private initialPrompt: string;
  private messages: Message[];

  async initialize(baseURL: string, model: string, systemPrompts: string[], initialPrompt: string) {
    this.model = model;
    this.baseURL = baseURL;
    this.systemPrompts = systemPrompts;
    this.initialPrompt = initialPrompt;
    // LATER: we could pull the model at this point, but that seems like not necessary at this point
  }

  async sendPrompt(message:string): Promise<Response> {
    if (message != "") {
      this.messages.push({
        role: 'user',
        content: message,
      });
    }
    const p = await fetch(this.baseURL + "api/chat", {
      method: "POST",
      body: JSON.stringify({
        "model": this.model,
        // LATER: support streaming calls?
        "stream": false,
        "options": {
          "temperature": 1
        },
        "messages": this.messages,
      }),
    })
    .then((response) => response.json())
    .then((resp: any) => {
      // TODO: error handling
      this.messages.push(resp.message);
      const i = resp.created_at;
      return {
        id: i,
        characterId: this.model,
        chatId: i,
        imageRelativePath: "",
        srcName: "ollama-" + this.model,
        text: resp.message.content,
      };
    });
    return p;
  }

  async start(): Promise<Response> {
    // send the basic system prompts and return the response
    const messages = this.systemPrompts.map((m) => ({
      "role": "system",
      "content": m,
    }));
    messages.push({
      "role": "user",
      "content": this.initialPrompt,
    });
    this.messages = messages;
    return this.sendPrompt("");
  }

  async receive(message: string): Promise<Response> {
    return this.sendPrompt(message);
  }
}

// Echo backend is just a testing backend that replies with exactly
// the message it was sent
class EchoBackend implements Backend {
  private messageID = 0;
  private chatID = 0;

  async start(): Promise<Response> {
    return {
      id: `${this.messageID}`,
      characterId: 'echo-backend',
      chatId: `${this.chatID++}`,
      srcName: 'echo-backend',
      text: 'welcome to the echo chamber.',
      imageRelativePath: null,
    };
  }

  async receive(message: string): Promise<Response> {
    return {
      id: `${++this.messageID}`,
      characterId: 'echo-backend',
      chatId: `${this.chatID}`,
      srcName: 'echo-backend',
      text: message,
      imageRelativePath: null,
    };
  }
}

// CharacterAI Backend uses the unofficial node character AI API
// to provide a backend supported by character.ai
class CharacterAIBackend implements Backend {
  private chat;
  private characterId;

  async initialize(token, characterId) {
    characterAI.requester.puppeteerPath = process.env.CHROME_BIN
    this.characterId = characterId
    if (!token) {
      console.log("No token found, authenticating as guest");
      await characterAI.authenticateAsGuest()
    } else {
      await characterAI.authenticateWithToken(token)
    }
    this.chat = await characterAI.createOrContinueChat(characterId)
  }

  async start(): Promise<Response> {
    await this.chat.saveAndStartNewChat();
    const history = await this.chat.fetchHistory();
    // TODO: some better null / error handling here...
    const {
      id, chat: { externalId }, srcName, text,
    } = (history.messages[0] || {})
    return {
      id,
      characterId: this.characterId,
      chatId: externalId,
      srcName,
      text,
      imageRelativePath: null,
    };
  }

  async receive(message: string): Promise<Response> {
    // TODO: error handling on input
    // TODO: error handling on response
    const response = await this.chat.sendAndAwaitResponse(message, true);
    const {
      id,
      text,
      imageRelativePath,
      srcCharacterName,
      chat: {
        externalId,
      },
    } = response;
    return {
      id,
      characterId: this.characterId,
      chatId: externalId,
      imageRelativePath,
      srcName: srcCharacterName,
      text,
    };
  }
}

(async () => {
  // parse the cli args to set up the configurables
  // TODO: swap this out for something more robust for cli parsing
  const {
    values: { token, backend: backendType, port, characterId },
  } = parseArgs({
    options: {
      token: {
        type: "string",
        short: "t",
        default: process.env.CHARACTER_AI_TOKEN,
      },
      backend: {
        type: "string",
        short: "b",
        default: process.env.BACKEND_TYPE || "echo",
      },
      port: {
        type: "string",
        short: "p",
        default: process.env.SERVER_PORT || "3000",
      },
      characterId: {
        type: "string",
        short: "c",
        default: process.env.CHARACTER_AI_CHARACTER_ID || "1AYQkwEQ83I3JKxMeNvctG4m7kQL1zTPJuGugAVsT_k",
      },
    },
  });

  let backend:Backend = null
  switch (backendType) {
    case "echo":
      backend = new EchoBackend();
      break ;
    case "ollama":
      const ol = new OLlamaBackend();
    // TODO: better parameterize all of this...
      await ol.initialize(
        "http://ollama:11434/",
        "neural-chat",
        [
          "you are a zoltar inspired fortune teller with a tiki / bayou flair",
          "your name is Makani",
          "you should always respond to prompts with a whimsical style",
        ],
        "please introduce yourself",
      );
      backend = ol;
      break ;
    case "characterai":
      const cai = new CharacterAIBackend();
      await cai.initialize(token, characterId)
      backend = cai;
      break ;
  }

  // Create and start the web server
  const app = express();
  app.use(express.json());

  // Start will start a new chat and return the greeting
  app.get('/start', async (req, res) => {
    // TODO: error handling here
    const resp = await backend.start();
    res.json(resp);
  });

  // Send will send the given message to the character and return the response text
  // Message should be POSTed in a json body with the "message" field set
  // for example:
  // curl -L http://localhost:3000/send \
  //  -X POST \
  //  -H 'Content-Type: application/json' \
  //  -d '{"message": "hello"}'
  app.post('/send', async (req, res) => {
    // TODO: error handling here
    const resp = await backend.receive(req.body.message)
    res.json(resp)
  });

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
})();
