import { GoogleGenAI, Type } from "@google/genai";
import {
  ProviderConstraints,
  DayOfWeek,
  ConversationState,
  ParsedResponse,
} from "../types";

if (!process.env.API_KEY) {
  console.warn(
    "API_KEY environment variable not set. Gemini API calls will fail."
  );
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// Schemas for different conversation states
const roleSchema = {
  type: Type.OBJECT,
  properties: {
    role: {
      type: Type.STRING,
      enum: ["provider", "administrator"],
      description: "The user's role.",
    },
  },
};
const nameSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "The user's full name." },
  },
};
const idSchema = {
  type: Type.OBJECT,
  properties: {
    id: {
      type: Type.STRING,
      description: "The user's ID, which can be alphanumeric.",
    },
  },
};
const confirmationSchema = {
  type: Type.OBJECT,
  properties: {
    confirmation: {
      type: Type.BOOLEAN,
      description:
        "True if the user's response is affirmative, false if negative.",
    },
  },
};

// ⬇️⬇️ UPDATED: schedulingSchema gains `horizon` and `startMonth`
const schedulingSchema = {
  type: Type.OBJECT,
  properties: {
    selectedStartDate: {
      type: Type.STRING,
      description:
        "If the user specifies a 'start date' for their schedule (e.g., 'start next Monday', 'use July 10th 2026'), extract that date in YYYY-MM-DD format. This date MUST be a Monday.",
    },
    // NEW: Horizon detection
    horizon: {
      type: Type.STRING,
      enum: ["month", "quarter"],
      description:
        "If the user asks for monthly or quarterly scheduling, set 'month' or 'quarter'. Leave undefined if not mentioned.",
    },
    // NEW: Quarter start month
    startMonth: {
      type: Type.STRING,
      description:
        "If horizon = 'quarter' and a specific quarter is implied (e.g., 'Q2 2026', 'this quarter', 'next quarter'), return the FIRST month of that quarter as YYYY-MM (e.g., '2026-04' for Q2 2026). Otherwise leave undefined.",
    },

    emailRecipient: {
      type: Type.STRING,
      description:
        "If the user asks to email or send the schedule to someone, extract the email address here.",
    },

    ptoRemovals: {
      type: Type.ARRAY,
      description:
        "List of PTO start dates (YYYY-MM-DD) to REMOVE or CANCEL from the existing schedule.",
      items: { type: Type.STRING },
    },

    dateConstraintRemovals: {
      type: Type.ARRAY,
      description:
        "List of dates (YYYY-MM-DD) to REMOVE required facility visits from.",
      items: { type: Type.STRING },
    },

    dayOfWeekConstraintRemovals: {
      type: Type.ARRAY,
      description:
        "List of days (e.g., 'Monday') to REMOVE recurring facility visit requirements from.",
      items: { type: Type.STRING, enum: Object.values(DayOfWeek) },
    },

    // existing fields
    censusMonth: {
      type: Type.STRING,
      description:
        "If the user mentions a specific month they are planning for (e.g., 'for January 2024'), extract it in YYYY-MM format. Otherwise, leave undefined.",
    },
    ptoRequests: {
      type: Type.ARRAY,
      description:
        "List of requested paid time off (PTO) periods. Dates must be in YYYY-MM-DD format.",
      items: {
        type: Type.OBJECT,
        properties: {
          startDate: {
            type: Type.STRING,
            description: "The start date of the PTO in YYYY-MM-DD format.",
          },
          endDate: {
            type: Type.STRING,
            description:
              "The end date of the PTO in YYYY-MM-DD format. For single-day PTO, this should be the same as the start date.",
          },
        },
        required: ["startDate", "endDate"],
      },
    },
    weeklyAvailability: {
      type: Type.ARRAY,
      description: "List of weekly work availability updates.",
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.STRING, enum: Object.values(DayOfWeek) },
          isWorking: { type: Type.BOOLEAN },
          startTime: {
            type: Type.STRING,
            description:
              "Start time in HH:MM format. Required if isWorking is true.",
          },
          endTime: {
            type: Type.STRING,
            description:
              "End time in HH:MM format. Required if isWorking is true.",
          },
        },
        required: ["day", "isWorking"],
      },
    },
    dailyPatientLimit: {
      type: Type.INTEGER,
      description: "The maximum number of patients to see per day.",
    },
    dayOfWeekConstraints: {
      type: Type.ARRAY,
      description:
        "List of specific facilities that MUST be visited on a specific day of the week.",
      items: {
        type: Type.OBJECT,
        properties: {
          facilityId: {
            type: Type.STRING,
            description: "The ID of the facility (e.g., 'F101').",
          },
          day: {
            type: Type.STRING,
            enum: Object.values(DayOfWeek),
            description: "The day of the week.",
          },
        },
        required: ["facilityId", "day"],
      },
    },
    dateConstraints: {
      type: Type.ARRAY,
      description:
        "List of specific facilities that MUST be visited on a specific calendar date.",
      items: {
        type: Type.OBJECT,
        properties: {
          facilityId: {
            type: Type.STRING,
            description: "The ID of the facility (e.g., 'F500').",
          },
          date: {
            type: Type.STRING,
            description: "The specific date in YYYY-MM-DD format.",
          },
        },
        required: ["facilityId", "date"],
      },
    },
    unclearRequest: {
      type: Type.STRING,
      description:
        "If the user's request is ambiguous or cannot be parsed, return a clarifying question or a message stating what you couldn't understand. Otherwise, leave undefined.",
    },
  },
};

const toYyyyMm = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function firstMonthOfQuarter(date: Date): string {
  const m = date.getMonth(); // 0..11
  const qStart = m - (m % 3); // 0,3,6,9
  return `${date.getFullYear()}-${String(qStart + 1).padStart(2, "0")}`;
}

function nextQuarterStart(date: Date): string {
  const m = date.getMonth();
  const qStart = m - (m % 3);
  const nextStartMonth = qStart + 3; // 3,6,9,12
  const year = date.getFullYear() + (nextStartMonth >= 12 ? 1 : 0);
  const month = (nextStartMonth % 12) + 1; // 1..12
  return `${year}-${String(month).padStart(2, "0")}`;
}

function inferHorizonFromText(request: string): {
  horizon?: "month" | "quarter";
  startMonth?: string;
} {
  const t = request.toLowerCase();
  const now = new Date();

  // Explicit “Q# 20xx”
  const qMatch = t.match(/\bq([1-4])\s*(\d{4})\b/);
  if (qMatch) {
    const q = Number(qMatch[1]);
    const yyyy = Number(qMatch[2]);
    const startMonth = q === 1 ? "01" : q === 2 ? "04" : q === 3 ? "07" : "10";
    return { horizon: "quarter", startMonth: `${yyyy}-${startMonth}` };
  }

  // “this quarter” / “next quarter” / “quarterly”
  if (t.includes("next quarter")) {
    return { horizon: "quarter", startMonth: nextQuarterStart(now) };
  }
  if (t.includes("this quarter")) {
    return { horizon: "quarter", startMonth: firstMonthOfQuarter(now) };
  }
  if (t.includes("quarter") || t.includes("quarterly")) {
    // If no explicit this/next/Q#, at least flip horizon.
    return { horizon: "quarter" };
  }

  // Monthly keywords
  if (t.includes("monthly") || t.includes("month")) {
    return { horizon: "month" };
  }

  return {};
}

export const parseProviderRequest = async (
  request: string,
  state: ConversationState,
  currentConstraints: ProviderConstraints
): Promise<ParsedResponse> => {
  let prompt: string;
  let schema: object;

  switch (state) {
    case "GREETING":
      prompt = `The user was asked if they are a provider or an administrator. Their response is: "${request}". Extract their role.`;
      schema = roleSchema;
      break;
    case "AWAITING_NAME":
      prompt = `The user was asked for their full name. Their response is: "${request}". Extract their full name.`;
      schema = nameSchema;
      break;
    case "AWAITING_ID":
      prompt = `The user was asked for their ID. Their response is: "${request}". Extract their ID. The ID might be alphanumeric.`;
      schema = idSchema;
      break;
    case "CONFIRMING_IDENTITY":
    case "AWAITING_SCHEDULE_CONFIRMATION":
      prompt = `The user was asked to confirm with a "yes" or "no". Their response is: "${request}". Determine if the response is affirmative (true) or negative (false).`;
      schema = confirmationSchema;
      break;
    case "SCHEDULING": {
      const today = new Date().toISOString().split("T")[0];
      // ⬇️⬇️ UPDATED: instructions include month/quarter intent and quarter-start rules
      prompt = `
You are a healthcare scheduling assistant.
Your goal is to translate natural language inputs from a provider into structured scheduling constraints for an optimization model. The current date is ${today}.
Parse the provider's request and extract any changes to their constraints, based on the current constraints.

Current Constraints: ${JSON.stringify(currentConstraints, null, 2)}
Provider's Request: "${request}"

Instructions:
1) Detect if the user prefers a monthly or quarterly planning horizon:
   - If they say "quarter", "quarterly schedule", "plan next quarter", etc., set horizon = "quarter".
   - If they say "month" or "monthly", set horizon = "month".
2) If horizon = "quarter", set startMonth (YYYY-MM) to the FIRST month of the quarter when possible:
   - "Q1 YYYY" -> YYYY-01, "Q2 YYYY" -> YYYY-04, "Q3 YYYY" -> YYYY-07, "Q4 YYYY" -> YYYY-10.
   - "this quarter" -> the first month of the current quarter.
   - "next quarter" -> the first month of the next quarter.
   - If no quarter is implied, omit startMonth.
3) Start Date: If the user specifies a specific start date (e.g., 'start next Monday', 'begin on 2026-07-20'), extract this date into selectedStartDate in YYYY-MM-DD format. You must calculate the date and ensure it is a Monday. 
4) PTO:
   - Extract NEW PTO dates into ptoRequests[].
   - If the user wants to CANCEL, REMOVE, or CHANGE a PTO, put the old start date (YYYY-MM-DD) into ptoRemovals[].
   - Example: "Change PTO from Jan 1 to Jan 2" -> ptoRemovals=["2024-01-01"], ptoRequests=[{startDate:"2024-01-02",...}].
5) Weekly availability:
   - Update weeklyAvailability[] entries by day (e.g., "I don't work Fridays").
6) Daily patient load:
   - Set dailyPatientLimit to the stated integer (e.g., "max 15 per day").
7) Required visit on a calendar date:
   - Add to dateConstraints[] with { facilityId, date } (YYYY-MM-DD).
   - To remove, add the date (YYYY-MM-DD) to dateConstraintRemovals[].
8) Required visit on a day-of-week:
   - Add to dayOfWeekConstraints[] with { facilityId, day }.
   - To remove, add the day name (e.g., "Monday") to dayOfWeekConstraintRemovals[].
9) If ambiguous, set unclearRequest with a short clarifying question.
10) Output a concise JSON strictly matching the provided schema. Include only fields being updated.
11) Email Requests: If the user asks to email the schedule (e.g. "send to boss@gmail.com"), extract the email address into emailRecipient.`;

      schema = schedulingSchema;
      break;
    }
    default:
      return {
        updatedConstraints: currentConstraints,
        systemResponse: "I seem to have lost my place. Let's start over.",
      };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const jsonText = (response.text ?? "").trim();
    const parsedData = JSON.parse(jsonText);
    if (state === "SCHEDULING") {
      const inferred = inferHorizonFromText(request);

      if (inferred.horizon && !parsedData.horizon) {
        parsedData.horizon = inferred.horizon;
      }
      if (inferred.startMonth && !parsedData.startMonth) {
        parsedData.startMonth = inferred.startMonth;
      }
    }

    if (state === "SCHEDULING") {
      return {
        updatedConstraints: currentConstraints,
        systemResponse: "", // App will generate the system response
        parsedData: {
          scheduleChanges: parsedData,
        },
      };
    } else {
      return {
        updatedConstraints: currentConstraints,
        systemResponse: "", // App will generate the system response
        parsedData: parsedData,
      };
    }
  } catch (error) {
    console.error("Error parsing provider request:", error);
    let userFriendlyError =
      "Sorry, I encountered an error while processing your request. Please try again.";
    if (state !== "SCHEDULING") {
      userFriendlyError =
        "I'm having trouble understanding that. Could you please rephrase?";
    }
    return {
      updatedConstraints: currentConstraints,
      systemResponse: userFriendlyError,
    };
  }
};
