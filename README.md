# AI Animatronic Skeleton Pipeline: Response Generation

This module holds the service for generating responses in the interactive
pipeline.
It currently offers 3 backends:

* [Character.AI](https://beta.character.ai/) (using [the Node Unoffical API](https://github.com/realcoloride/node_characterai))
* [OLlama](https://ollama.com/)
* An "Echo" backend which just replies with exactly what you send it

## Interface

Currently,
running this will start an http server which listens for a few requests:

### GET /start

This will indicate to the backend that you are ready to start a new chat.
Current behavior for the CharacterAI backend is to continue the last conversation
by default unless you call start to signal it to start a new one.

#### Example

```bash
curl -L http://localhost:3000/start
```

```json
{
  "id": "1",
  "characterId": "echo-backend",
  "chatId": "0",
  "srcName": "echo-backend",
  "text": "thank you do you see anything else",
  "imageRelativePath": null
}
```

### POST /send

This request is used to send a message to the response generation backend
and get a response.

#### Example

```bash
curl -L http://localhost:3000/send \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"message": "thank you do you see anything else"}'
```

```json
{
  "id": "623372047620845726",
  "characterId": "1AYQkwEQ83I3JKxMeNvctG4m7kQL1zTPJuGugAVsT_k",
  "chatId": "khg0UKm2xsxdzOVddesu8y7_gLOz7KUOn_-gs_1gsog",
  "imageRelativePath": "https://characterai.io/static/tti/a/8/4/9/3/1/a8493149-f551-4575-801a-455a0689c0a2/0.webp",
  "srcName": "The Fortune Teller",
  "text": "In the area of career and public life, I see success, recognition and financial rewards. You have the drive and determination to accomplish what you set your mind to. I also see that you will need to be careful in relationships because you could suffer some disappointment or betrayal, but do not be disheartened - you are fated for great success and happiness in the end. \n\nIs there anything you'd like to ask of more specific nature?"
}
```

## Running It

You can run `make` to compile and run the server with the default options.

Alternatively, `make index.js`
then you can just run `node index.js` with the flags you wish to alter.

Currently supported flags:

| flag | description |
| ---- | ----------- |
| --token <token>, -t <token> | The Character.ai token to use, see [here](https://github.com/realcoloride/node_characterai#using-an-access-token) to get the token. If not provided, will authenticate as a guest. Also, can be provided via the environment as `CHARACTER_AI_TOKEN`. |
| --port <port>, -p <port> | The port to run the server on, defaults to `3000` |
| --characterid <id>, -c <id> | The Character.ai character ID to use, defaults to a fortune teller character I've been using for testing. |
| --backend <echo|characterai>, -b <echo|characterai> | The backend to use for generating the responses. |
