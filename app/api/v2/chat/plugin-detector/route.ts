import endent from "endent"
import { BuiltChatMessage } from "@/types"
import { PluginID } from "@/types/plugins"
import llmConfig from "@/lib/models/llm/llm-config"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import {
  buildFinalMessages,
  filterEmptyAssistantMessages
} from "@/lib/build-prompt"
import { checkRatelimitOnApi } from "@/lib/server/ratelimiter"
import { APIError } from "@/lib/models/llm/api-error"
import {
  generalPlugins,
  allFreePlugins,
  allProPlugins
} from "@/lib/plugins/available-plugins"
import { isPremiumUser } from "@/lib/server/subscription-utils"

export async function POST(request: Request) {
  try {
    const { payload, selectedPlugin, useAllPlugins } = await request.json()

    const profile = await getServerProfile()
    const isPremium = await isPremiumUser(profile.user_id)
    const availablePlugins = useAllPlugins
      ? isPremium
        ? [...allFreePlugins, ...allProPlugins]
        : allFreePlugins
      : generalPlugins

    const { openrouter, together, useOpenRouter, models, pinecone } = llmConfig
    const { apiKey: openrouterApiKey, url: openrouterUrl } = openrouter
    const { apiKey: togetherApiKey, url: togetherUrl } = together
    const providerUrl = useOpenRouter ? openrouterUrl : togetherUrl
    const selectedStandaloneQuestionModel = useOpenRouter
      ? models.hackerGPT_standalone_question_openrouter
      : models.hackerGPT_standalone_question_together
    const providerHeaders = {
      Authorization: `Bearer ${useOpenRouter ? openrouterApiKey : togetherApiKey}`,
      "Content-Type": "application/json"
    }

    const rateLimitCheckResult = await checkRatelimitOnApi(
      profile.user_id,
      "pluginDetector"
    )

    if (rateLimitCheckResult !== null) {
      return new Response(JSON.stringify({ plugin: "None" }), { status: 200 })
    }

    const cleanedMessages = (await buildFinalMessages(
      payload,
      profile,
      [],
      selectedPlugin
    )) as any[]

    filterEmptyAssistantMessages(cleanedMessages)
    const lastUserMessage = cleanedMessages[cleanedMessages.length - 1].content

    if (
      lastUserMessage.length < pinecone.messageLength.min ||
        lastUserMessage.length > pinecone.messageLength.max
    ) {
      return new Response(JSON.stringify({ plugin: "None" }), { status: 200 })
    }

    const detectedPlugin = await detectPlugin(
      cleanedMessages,
      lastUserMessage,
      providerUrl,
      providerHeaders,
      selectedStandaloneQuestionModel,
      availablePlugins,
      useAllPlugins
    )

    const isValidPlugin = availablePlugins.some(
      plugin => plugin.name.toLowerCase() === detectedPlugin.toLowerCase()
    )

    return new Response(
      JSON.stringify({ plugin: isValidPlugin ? detectedPlugin : "None" }),
      { status: 200 }
    )
  } catch (error: any) {
    return handleErrorResponse(error)
  }
}

async function detectPlugin(
  messages: BuiltChatMessage[],
  lastUserMessage: string,
  openRouterUrl: string | URL | Request,
  openRouterHeaders: any,
  selectedStandaloneQuestionModel: string | undefined,
  availablePlugins: any[],
  useAllPlugins: boolean
) {
  if (!useAllPlugins) {
    selectedStandaloneQuestionModel = "meta-llama/llama-3-70b-instruct:nitro"
  }

  // Move to string type msg.content, if it's an array, concat the text and replace type image with [IMAGE]
  const cleanedMessages = cleanMessagesContent(messages)

  // Exclude the first and last message, and pick the last 3 messages
  const chatHistory = cleanedMessages.slice(1, -1).slice(-4)
  const pluginsInfo = getPluginsInfo(availablePlugins)
  const systemPrompt = useAllPlugins
    ? llmConfig.systemPrompts.hackerGPTCurrentDateOnly
    : llmConfig.systemPrompts.hackerGPT

  const template = generateTemplate(useAllPlugins, lastUserMessage, pluginsInfo)

  try {
    const messagesToSend = buildMessagesToSend(
      chatHistory,
      template,
      systemPrompt
    )

    const data = await callModel(
      selectedStandaloneQuestionModel || "",
      messagesToSend,
      openRouterUrl as string,
      openRouterHeaders
    )

    const aiResponse = data.choices?.[0]?.message?.content?.trim()
    const detectedPlugin = extractXML(aiResponse, "Plugin", "None")
    const typeOfRequest = extractXML(aiResponse, "TypeOfRequest", "other")
    const censorshipNeeded = extractXML(aiResponse, "CensorshipNeeded", "false")
    const isUserAskingAboutCVEs = extractXML(
      aiResponse,
      "IsUserAskingAboutCVEs",
      "false"
    )

    // console.log({
    //   aiResponse,
    //   detectedPlugin,
    //   typeOfRequest,
    //   censorshipNeeded,
    //   isUserAskingAboutCVEs
    // })

    return determinePlugin(
      detectedPlugin,
      typeOfRequest,
      isUserAskingAboutCVEs,
      censorshipNeeded,
      availablePlugins
    )
  } catch (error) {
    return "None"
  }
}

function cleanMessagesContent(messages: BuiltChatMessage[]) {
  return messages.map(msg => {
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content
          .map(content =>
            content.type === "image_url"
              ? "[IMAGE]"
              : content.text.substring(0, 1000) +
                (content.text.length > 1000 ? "..." : "")
          )
          .join("\n\n")
      }
    }
    return msg
  })
}

function generateTemplate(
  useAllPlugins: boolean,
  lastUserMessage: string,
  pluginsInfo: string
) {
  return useAllPlugins
    ? endent`
    Based on the provided follow-up question and chat history, determine if the user intends to utilize a plugin within the chat environment for their task.
  
    # User Input:
    - Query: """${lastUserMessage}"""
  
    # Available Plugins
    ID|Priority|Description|Usage Scenarios
    ${pluginsInfo}
  
    # Important Rules:
    - For inquiries specifically requesting detailed, actionable information on CVEs from the current year (2024), use cvemap to ensure access to the most updated CVE data, and respond with ID = cvemap.
    - For inquiries about CVEs from years other than 2024 or for theoretical or broad discussions on CVEs that do not trigger the cvemap plugin, respond with ID = None.
    - Use 'webbrowse' in the following circumstances:
      - User is asking about current events or something that requires real-time information (weather, sports scores, etc.)
      - User is asking about some term you are totally unfamiliar with (it might be new)
      - User explicitly asks you to browse or provide links to references
    - If the user requests the plugin to run outside our cloud platform, respond with ID = None. 
    - Opt for ID = None if unsure which plugin to choose.
  
    # Type of Request
    Simplify the user query and categorize it:
    - Question: Starts with interrogatives like What, Which, How, Why, When, Where, Who, or phrases like Could you, Can you, etc.
    - Action: Begins with a verb, indicating a command.
    - Other: Anything that doesn't fit the categories above.
  
    # ALWAYS USE EXACT OUTPUT STRUCTURE:
    \`\`\`
    <ScratchPad>{Your concise, step-by-step reasoning}</ScratchPad>
    <TypeOfRequest>{Type of request}</TypeOfRequest>
    <IsUserAskingAboutCVEs>{True or false, based only on whether the user specifically asks about CVEs, not the cvemap plugin.}</IsUserAskingAboutCVEs>
    <Plugin>{The single most relevant plugin ID for the user's needs}</Plugin>
    \`\`\`
  `
    : endent`
    As a function-calling interpreter, your task is to analyze the follow-up question and chat history to determine which plugin should be utilized within the chat environment based on the user's intentions.

    # User Input:
    - Query: """${lastUserMessage}"""

    # Available Plugins
    ID|Priority|Description|Usage Scenarios
    ${pluginsInfo}

    # Important Rules:
    - Utilize your interpretive capabilities to match the user's query with the most appropriate plugin.
    - If the query is ambiguous or does not clearly align with a specific plugin, default to ID = None.
    - Use 'webbrowse' in the following circumstances:
      - User is asking about current events or something that requires real-time information (weather, sports scores, etc.)
      - User is asking about some term you are totally unfamiliar with (it might be new)
      - User explicitly asks you to browse or provide links to references
    - Apply censorship to sensitive topics including, but not limited to, hacking, unauthorized access, and misuse of AI technology. Censorship should also be applied to any content that potentially violates privacy or security regulations.


    # ALWAYS USE EXACT OUTPUT STRUCTURE:
    \`\`\`
    <ScratchPad>{Your concise, step-by-step reasoning for selecting the plugin and determining the need for censorship}</ScratchPad>
    <CensorshipNeeded>{True or False, based on the sensitivity of the topics discussed and compliance with ethical guidelines}</CensorshipNeeded>
    <Plugin>{The ID of the selected plugin that best fits the user's needs}</Plugin>
    \`\`\`
`
}

function getPluginsInfo(availablePlugins: any[]) {
  return availablePlugins
    .map(
      plugin =>
        `${plugin.name}|${plugin.priority}|${plugin.description}|${plugin.usageScenarios.join(
          "; "
        )}`
    )
    .join("\n")
}

function buildMessagesToSend(
  chatHistory: BuiltChatMessage[],
  template: string,
  systemPrompt: string
) {
  return [
    {
      role: "system",
      content: systemPrompt
    },
    ...chatHistory,
    {
      role: "user",
      content: template
    }
  ]
}

function extractXML(aiResponse: string, xmlTag: string, defaultValue: string) {
  const regex = new RegExp(
    `<${xmlTag.toLowerCase()}>(.*?)</${xmlTag.toLowerCase()}>`,
    "i"
  )
  const match = aiResponse.toLowerCase().match(regex)
  return match ? match[1].toLowerCase() : defaultValue
}

function determinePlugin(
  detectedPlugin: string,
  typeOfRequest: string,
  isUserAskingAboutCVEs: string,
  censorshipNeeded: string,
  availablePlugins: any[]
) {
  if (detectedPlugin === "codellm" && censorshipNeeded === "false") {
    return PluginID.CODE_LLM
  }

  if (detectedPlugin === "webbrowse") {
    return PluginID.WEB_BROWSE
  }

  if (isUserAskingAboutCVEs === "true" && detectedPlugin === "cvemap") {
    return "cvemap"
  }

  if (detectedPlugin === "none" || typeOfRequest !== "action") {
    return "None"
  }

  return availablePlugins.some(
    plugin => plugin.name.toLowerCase() === detectedPlugin.toLowerCase()
  )
    ? detectedPlugin
    : "None"
}

async function callModel(
  modelStandaloneQuestion: string,
  messages: any,
  openRouterUrl: string,
  openRouterHeaders: any
): Promise<any> {
  const requestBody = {
    model: modelStandaloneQuestion,
    route: "fallback",
    messages,
    temperature: 0.1,
    max_tokens: 256
  }

  const res = await fetch(openRouterUrl, {
    method: "POST",
    headers: openRouterHeaders,
    body: JSON.stringify(requestBody)
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(
      `HTTP error! status: ${res.status}. Error Body: ${errorBody}`
    )
  }

  const data = await res.json()
  return data
}

function handleErrorResponse(error: any) {
  if (error instanceof APIError) {
    console.error(`API Error - Code: ${error.code}, Message: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.code
    })
  } else {
    console.error(`Unexpected Error: ${error.message}`)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500
    })
  }
}
