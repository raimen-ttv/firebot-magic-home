import {
  Firebot,
  RunRequest,
  ScriptReturnObject,
  
} from '@crowbartools/firebot-custom-scripts-types';

import { EventManager, EventSource } from '@crowbartools/firebot-custom-scripts-types/types/modules/event-manager';
import { EventFilter } from '@crowbartools/firebot-custom-scripts-types/types/modules/event-filter-manager';
import { EventEmitter } from 'events';


import { Logger } from '@crowbartools/firebot-custom-scripts-types/types/modules/logger';
import { Effects } from '@crowbartools/firebot-custom-scripts-types/types/effects';

const { Configuration, OpenAIApi } = require("openai");
let eventManager: EventManager;
let db: any;
let logger: Logger;

// import axios from 'axios';
import { promises as fs } from 'fs';

type Parameters = {
  [key in 'apiKey' | 'prePrompt']: string;
};

class Chatbot {
  private api_key: string;
  private chat_history: { role: string; content: string }[];

  constructor(api_key: string, username: string) {
    this.api_key = api_key;
    this.chat_history = [];
    this.load_chat_history(username);
  }

  private async load_chat_history(username: string) {
    const filename = `chat_history_${username}.json`;
    try {
      const data = await fs.readFile(filename, 'utf-8');
      this.chat_history = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Error loading chat history for ${username}:`, error);
      }
    }
  }

  private async save_chat_history(username: string) {
    const filename = `chat_history_${username}.json`;
    try {
   await fs.writeFile(filename, JSON.stringify(this.chat_history), 'utf-8'); 
    } catch (error) {
      console.error(`Error saving chat history for ${username}:`, error);
    }
  }

  public async generate_response(user_input: string, prePrompt: string, username: string) {
    const configuration = new Configuration({
      apiKey: `${this.api_key}`,
    });
    const openai = new OpenAIApi(configuration);
    const prompt =
      this.chat_history
        .slice(-5)
        .map(message => `${message.role}: ${message.content}`)
        .join('\n') + `\nUser: ${user_input}`;

    try {
      const response = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: prePrompt },
          ...this.chat_history,
          { role: 'user', content:`${username} says: ${user_input}`  },
        ],
      }, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.api_key}`,
        },
      });
     
      const aiResponse = response.data.choices[0].message.content;

      this.chat_history.push({ role: 'user', content: `${username} says: ${user_input}` });
      this.chat_history.push({ role: 'assistant', content: aiResponse });

      await this.save_chat_history(username);

      return aiResponse;
    } catch (error) {
      throw new Error('${error}Error sending request to OpenAI API');
    }
  }
}

// Create a Map to store chatbot instances per user
const userChatbots = new Map<string, Chatbot>();

const script: Firebot.CustomScript<Parameters> = {
  getScriptManifest: () => {
    return {
      name: 'ChatGPT',
      description: 'Uses OpenAI GPT-3.5-turbo to generate chat messages',
      author: 'Your Name',
      version: '1.0',
    };
  },
  getDefaultParameters: () => {
    return {
      apiKey: {
        type: 'string',
        description: 'OpenAI API Key',
        default: '',
      },
      prePrompt: {
        type: 'string',
        description: 'Preprompt for personality',
        default: '',
      },
    };
  },
  run: async (runRequest: RunRequest<Parameters>): Promise<ScriptReturnObject> => {
    const chatMessage = runRequest.trigger.metadata.userCommand.args.join(' ');
    const apiKey = runRequest.parameters.apiKey;
    const username = runRequest.trigger.metadata.username;
    const prePrompt = runRequest.parameters.prePrompt;

    // Get or create chatbot instance for the user
    let chatbot = userChatbots.get(username);
    if (!chatbot) {
      chatbot = new Chatbot(apiKey, username);
      userChatbots.set(username, chatbot);
    }
  
    try {
      // Ensure the response is generated before sending it
      const aiResponse = await chatbot.generate_response(chatMessage, prePrompt, username);
  
      return {
        success: true,
        effects: [
          {
            type: 'firebot:chat',
            message:`/me ${username} ${aiResponse}`,
            command: '!send ${aiResponse}',
            args:[`${aiResponse}`],
            chatter: 'Bot',
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: `${error}Error sending request to OpenAI API`,
        effects: [],
      };
    }
  },
};

export default script;

