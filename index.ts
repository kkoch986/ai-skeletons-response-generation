const express = require("express");
const CharacterAI = require("node_characterai");
// @ts-ignore
import { parseArgs } from "node:util";
const characterAI = new CharacterAI();

type ChatResponse = {
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
  start(): Promise<ChatResponse>,
  receive(message:string): Promise<ChatResponse>,
};

// OLlama backend is backed by ollama
class OLlamaBackend implements Backend {
  private baseURL: string;
  private model: string;
  private systemPrompts: string[];
  private initialPrompt: string;
  private postIntroductionSystemPrompts: string[];
  private messages: Message[];

  async initialize(
    baseURL: string,
    model: string,
    systemPrompts: string[],
    initialPrompt: string,
    postIntroductionSystemPrompts: string[],
  ) {
    this.model = model;
    this.baseURL = baseURL;
    this.systemPrompts = systemPrompts.filter((i) => !!i);
    this.initialPrompt = initialPrompt;
    this.postIntroductionSystemPrompts = postIntroductionSystemPrompts;

    return this.pullModel(this.model);
  }

  async pullModel(modelName: string): Promise<Response> {
    const p = await fetch(this.baseURL + "api/pull", {
      method: "POST",
      body: JSON.stringify({
        "name": modelName,
      }),
    });
    return p;
  }

  async sendPrompt(message:string): Promise<ChatResponse> {
    if (message != "") {
      this.messages.push({
        role: 'user',
        content: message,
      });
    }
    console.log(this.messages);
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

  async start(): Promise<ChatResponse> {
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
    return this.sendPrompt("").then((resp) => {
      this.postIntroductionSystemPrompts.forEach((m) => {
        this.messages.push({
          "role": "system",
          "content": m,
        });
      });
      return resp;
    });
  }

  async receive(message: string): Promise<ChatResponse> {
    return this.sendPrompt(message);
  }
}

// Echo backend is just a testing backend that replies with exactly
// the message it was sent
class EchoBackend implements Backend {
  private messageID = 0;
  private chatID = 0;

  async start(): Promise<ChatResponse> {
    return {
      id: `${this.messageID}`,
      characterId: 'echo-backend',
      chatId: `${this.chatID++}`,
      srcName: 'echo-backend',
      text: 'welcome to the echo chamber.',
      imageRelativePath: null,
    };
  }

  async receive(message: string): Promise<ChatResponse> {
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

  async start(): Promise<ChatResponse> {
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

  async receive(message: string): Promise<ChatResponse> {
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
    values: {
      ollamaBaseModel,
      ollamaUrl,
      ollamaInitialPrompt,
      ollamaSystemPrompts,
      ollamaPostIntroductionPrompts,
      characterAIToken,
      backend: backendType,
      port,
      characterId,
    },
  } = parseArgs({
    options: {
      characterAIToken: {
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
      ollamaUrl: {
        type: "string",
        default: process.env.OLLAMA_URL || "http://ollama:11434",
      },
      ollamaBaseModel: {
        type: "string",
        default: process.env.OLLAMA_BASE_MODEL || "neural-chat",
      },
      ollamaInitialPrompt: {
        type: "string",
        default: process.env.OLLAMA_INITIAL_PROMPT || "please introduce yourself",
      },
      ollamaSystemPrompts: {
        type: "string",
        multiple: true,
        default: (process.env.OLLAMA_SYSTEM_PROMPTS || "").split("\n") || [
          "you are a zoltar inspired fortune teller with a tiki / bayou flair.",
          "you always refer to yourself as Makani.",
          "please respond to all prompts with a whimsical style.",
        ],
      },
      ollamaPostIntroductionPrompts: {
        type: "string",
        multiple: true,
        default: (process.env.OLLAMA_POST_INTRO_PROMPTS || "").split("\n") || [],
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
      await ol.initialize(
        ollamaUrl,
        ollamaBaseModel,
        ollamaSystemPrompts,
        ollamaInitialPrompt,
        ollamaPostIntroductionPrompts,
      );
      backend = ol;
      break ;
    case "characterai":
      const cai = new CharacterAIBackend();
      await cai.initialize(characterAIToken, characterId)
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
