import React, { useState, useCallback, useEffect } from "react";
import {
  ProviderConstraints,
  ChatMessage,
  DayOfWeek,
  ConversationState,
  UserProfile,
  PTORequest,
  WeeklyAvailability,
  OptimizationResult,
  OptimizedDailySchedule,
  ScheduleChanges,
} from "./types";
import Header from "./components/Header";
import ChatInterface from "./components/ChatInterface";
import ConstraintsDisplay from "./components/ConstraintsDisplay";
import ScheduleDisplay from "./components/ScheduleDisplay";
import OptimizationControl from "./components/OptimizationControl";
import Dashboard from "./components/Dashboard";
import AuthPage from "./components/AuthPage";
import UserProfileModal from "./components/UserProfileModal";
import { useAuth } from "./contexts/AuthContext";
import { parseProviderRequest } from "./services/geminiService";
import { runOptimization, fetchBusinessLines } from "./services/apiService";
import { generateIcsFile } from "./services/icalService";
import AdvancedSettingsSidebar from "./components/AdvancedSettingsSidebar";
import { AdvancedSettings } from "./types";

const initialConstraints: ProviderConstraints = {
  ptoRequests: [],
  weeklyAvailability: [
    { day: DayOfWeek.Sunday, isWorking: false },
    {
      day: DayOfWeek.Monday,
      isWorking: true,
      startTime: "09:00",
      endTime: "17:00",
    },
    {
      day: DayOfWeek.Tuesday,
      isWorking: true,
      startTime: "09:00",
      endTime: "17:00",
    },
    {
      day: DayOfWeek.Wednesday,
      isWorking: true,
      startTime: "09:00",
      endTime: "17:00",
    },
    {
      day: DayOfWeek.Thursday,
      isWorking: true,
      startTime: "09:00",
      endTime: "17:00",
    },
    {
      day: DayOfWeek.Friday,
      isWorking: false,
      startTime: "09:00",
      endTime: "17:00",
    },
    { day: DayOfWeek.Saturday, isWorking: false },
  ],
  dailyPatientLimit: 15,
  dayOfWeekConstraints: [],
  dateConstraints: [],
};

const applyChanges = (
  current: ProviderConstraints,
  changes: ScheduleChanges
): ProviderConstraints => {
  const newConstraints = JSON.parse(JSON.stringify(current));

  if (changes.ptoRemovals && changes.ptoRemovals.length > 0) {
    newConstraints.ptoRequests = newConstraints.ptoRequests.filter(
      (pto: PTORequest) => !changes.ptoRemovals?.includes(pto.startDate)
    );
  }
  if (changes.ptoRequests && changes.ptoRequests.length > 0) {
    newConstraints.ptoRequests = [
      ...newConstraints.ptoRequests,
      ...changes.ptoRequests,
    ];
    const uniquePto = Array.from(
      new Set(newConstraints.ptoRequests.map(JSON.stringify))
    ).map((s) => JSON.parse(s as string) as PTORequest);
    newConstraints.ptoRequests = uniquePto;
  }

  if (changes.weeklyAvailability && changes.weeklyAvailability.length > 0) {
    changes.weeklyAvailability.forEach(
      (update: Partial<WeeklyAvailability>) => {
        const dayIndex = newConstraints.weeklyAvailability.findIndex(
          (d: WeeklyAvailability) => d.day === update.day
        );
        if (dayIndex !== -1) {
          const currentDay = newConstraints.weeklyAvailability[dayIndex];

          // Case A: Setting to OFF
          if (update.isWorking === false) {
            update.startTime = undefined;
            update.endTime = undefined;
          }
          // Case B: Setting to ON (Working)
          else if (update.isWorking === true) {
            // Fix 1: Sanitize format (truncate '09:00-17:00' to '09:00')
            if (update.startTime && update.startTime.length > 5) {
              update.startTime = update.startTime.substring(0, 5);
            }
            if (update.endTime && update.endTime.length > 5) {
              update.endTime = update.endTime.substring(0, 5);
            }

            // Fix 2: Apply Defaults if times are missing in BOTH update and current state
            // If start time is missing, default to 09:00
            if (!update.startTime && !currentDay.startTime) {
              update.startTime = "09:00";
            }
            // If end time is missing, default to 17:00
            if (!update.endTime && !currentDay.endTime) {
              update.endTime = "17:00";
            }

            // Fix 3: Ensure we don't end up with mixed existing/undefined states
            // If we have a start time (from update or existing) but no end time, force default
            const finalStart = update.startTime || currentDay.startTime;
            const finalEnd = update.endTime || currentDay.endTime;

            if (finalStart && !finalEnd) update.endTime = "17:00";
            if (!finalStart && finalEnd) update.startTime = "09:00";
          }
          newConstraints.weeklyAvailability[dayIndex] = {
            ...newConstraints.weeklyAvailability[dayIndex],
            ...update,
          };
        }
      }
    );
  }

  if (
    changes.dailyPatientLimit !== undefined &&
    changes.dailyPatientLimit !== null
  ) {
    newConstraints.dailyPatientLimit = changes.dailyPatientLimit;
  }

  if (
    changes.dayOfWeekConstraintRemovals &&
    changes.dayOfWeekConstraintRemovals.length > 0
  ) {
    newConstraints.dayOfWeekConstraints = (
      newConstraints.dayOfWeekConstraints || []
    ).filter(
      (dowc: any) => !changes.dayOfWeekConstraintRemovals?.includes(dowc.day)
    );
  }
  if (changes.dayOfWeekConstraints && changes.dayOfWeekConstraints.length > 0) {
    newConstraints.dayOfWeekConstraints = [
      ...newConstraints.dayOfWeekConstraints,
      ...changes.dayOfWeekConstraints,
    ];
  }

  if (
    changes.dateConstraintRemovals &&
    changes.dateConstraintRemovals.length > 0
  ) {
    newConstraints.dateConstraints = (
      newConstraints.dateConstraints || []
    ).filter((dc: any) => !changes.dateConstraintRemovals?.includes(dc.date));
  }
  if (changes.dateConstraints && changes.dateConstraints.length > 0) {
    newConstraints.dateConstraints = [
      ...newConstraints.dateConstraints,
      ...changes.dateConstraints,
    ];
  }
  return newConstraints;
};

const generateChangeSummary = (
  original: ProviderConstraints,
  proposed: ProviderConstraints
): string => {
  const summaryParts: string[] = [];

  const originalPtoStrings = new Set(
    original.ptoRequests.map((p) => JSON.stringify(p))
  );
  const newPtos = proposed.ptoRequests.filter(
    (p) => !originalPtoStrings.has(JSON.stringify(p))
  );

  if (newPtos.length > 0) {
    const ptoStrings = newPtos.map((p) =>
      p.startDate === p.endDate ? p.startDate : `${p.startDate} to ${p.endDate}`
    );
    summaryParts.push(`add PTO for: ${ptoStrings.join(", ")}`);
  }

  const proposedPtoStrings = new Set(
    proposed.ptoRequests.map((p) => JSON.stringify(p))
  );
  const removedPtos = original.ptoRequests.filter(
    (p) => !proposedPtoStrings.has(JSON.stringify(p))
  );
  if (removedPtos.length > 0) {
    const ptoStrings = removedPtos.map((p) =>
      p.startDate === p.endDate ? p.startDate : `${p.startDate} to ${p.endDate}`
    );
    summaryParts.push(`remove PTO for: ${ptoStrings.join(", ")}`);
  }

  const dayOrder = Object.values(DayOfWeek);
  const sortedOriginal = [...original.weeklyAvailability].sort(
    (a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)
  );
  const sortedProposed = [...proposed.weeklyAvailability].sort(
    (a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)
  );

  const availabilityChanges = sortedProposed.filter(
    (day, index) =>
      JSON.stringify(day) !== JSON.stringify(sortedOriginal[index])
  );
  if (availabilityChanges.length > 0) {
    const availabilityStrings = availabilityChanges.map(
      (d) =>
        `${d.day} to ${d.isWorking ? `${d.startTime}-${d.endTime}` : "Off"}`
    );
    summaryParts.push(
      `update availability for ${availabilityStrings.join(", ")}`
    );
  }

  if (original.dailyPatientLimit !== proposed.dailyPatientLimit) {
    summaryParts.push(
      `set the daily patient limit to ${proposed.dailyPatientLimit}`
    );
  }

  const originalDowStrings = new Set(
    original.dayOfWeekConstraints.map((c) => JSON.stringify(c))
  );
  const newDowConstraints = proposed.dayOfWeekConstraints.filter(
    (c) => !originalDowStrings.has(JSON.stringify(c))
  );
  if (newDowConstraints.length > 0) {
    const dowStrings = newDowConstraints.map(
      (c) => `${c.facilityId} on ${c.day}s`
    );
    summaryParts.push(`add required visits for: ${dowStrings.join(", ")}`);
  }

  const originalDateStrings = new Set(
    original.dateConstraints.map((c) => JSON.stringify(c))
  );
  const newDateConstraints = proposed.dateConstraints.filter(
    (c) => !originalDateStrings.has(JSON.stringify(c))
  );
  if (newDateConstraints.length > 0) {
    const dateStrings = newDateConstraints.map(
      (c) => `${c.facilityId} on ${c.date}`
    );
    summaryParts.push(`add required visits for: ${dateStrings.join(", ")}`);
  }

  if (summaryParts.length === 0) {
    return "There are no changes to confirm.";
  }

  return `I am about to ${summaryParts.join(" and ")}.`;
};

const App: React.FC = () => {
  // Authentication from new App
  const { user, isAuthenticated, isAuthLoading, logout } = useAuth();

  const [constraints, setConstraints] =
    useState<ProviderConstraints>(initialConstraints);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationState, setConversationState] =
    useState<ConversationState>("GREETING");
  const [proposedConstraints, setProposedConstraints] =
    useState<ProviderConstraints | null>(null);

  const [optimizedSchedule, setOptimizedSchedule] = useState<
    OptimizedDailySchedule[] | null
  >(null);
  const [optimizationMetrics, setOptimizationMetrics] = useState<
    OptimizationResult["metrics"] | null
  >(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [businessLines, setBusinessLines] = useState<string[]>([]);
  const [selectedBusinessLine, setSelectedBusinessLine] = useState<string>("");
  // month vs quarter
  const [horizon, setHorizon] = useState<"month" | "quarter">("month");
  // New: selected start date (a Monday in ISO format: YYYY-MM-DD)
  const [selectedStartDate, setSelectedStartDate] = useState<string | null>(
    null
  );
  const [planningDuration, setPlanningDuration] = useState<number>(4);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>({
    lambda_param: 0,
    lambda_facility: 0.1,
    lambda_bunching: 0.1,
    alpha: 0.05,
    facility_visit_window: 10,
  });

  // Initialize when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      // Initialize messages with greeting - only once
      if (messages.length === 0) {
        setMessages([
          {
            id: "1",
            sender: "system",
            text: `Hello ${user.name}! I am your healthcare scheduling assistant. How can I help you manage your schedule today? You can make PTO requests, update your availability, or set patient limits.`,
          },
        ]);
        setConversationState("SCHEDULING");
      }

      // Fetch configuration data
      fetchBusinessLines()
        .then((data) => {
          setBusinessLines(data);
          if (data.length > 0) setSelectedBusinessLine(data[0]);
        })
        .catch(console.error);
    } else {
      // Reset state when logged out
      setMessages([]);
      setConstraints(initialConstraints);
      setConversationState("GREETING");
      setProposedConstraints(null);
      setOptimizedSchedule(null);
      setOptimizationMetrics(null);
    }
  }, [isAuthenticated, user]);

  const addSystemMessage = (text: string) => {
    const systemMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      sender: "system",
      text,
    };
    setMessages((prev) => [...prev, systemMessage]);
  };

  const handleStartDateChange = useCallback((dateIso: string) => {
    // dateIso is expected to be "YYYY-MM-DD"
    setSelectedStartDate(dateIso);
  }, []);

  const handleGenerateSchedule = useCallback(async () => {
    if (!user?.id || !selectedBusinessLine || !selectedStartDate) {
      addSystemMessage(
        "I can't generate a schedule until you have selected a business line and a start date (Monday)."
      );
      return;
    }

    setIsOptimizing(true);
    setOptimizedSchedule(null);
    setOptimizationMetrics(null);

    try {
      const providerConstraintsPayload = {
        ptoRequests: constraints.ptoRequests.map((pto) => ({
          startDate: pto.startDate,
          endDate: pto.endDate,
        })),
        weeklyAvailability: constraints.weeklyAvailability.map((wa) => ({
          day: wa.day,
          isWorking: wa.isWorking,
          startTime: wa.startTime,
          endTime: wa.endTime,
        })),
        dateConstraints: (constraints.dateConstraints || []).map((dc) => ({
          facilityId: dc.facilityId,
          date: dc.date,
        })),
        dayOfWeekConstraints: (constraints.dayOfWeekConstraints || []).map(
          (dowc) => ({
            facilityId: dowc.facilityId,
            day: dowc.day,
          })
        ),
      };

      const payload = {
        business_line: selectedBusinessLine,
        start_monday: selectedStartDate, // NEW: explicit start date (Monday) for rolling window
        horizon: horizon, // 'month' or 'quarter'
        optimization_mode: "single_provider",
        selected_provider: user.id,
        max_patients_per_day: constraints.dailyPatientLimit || 15,
        weeks: planningDuration,
        lambda_param: advancedSettings.lambda_param,
        lambda_facility: advancedSettings.lambda_facility,
        lambda_bunching: advancedSettings.lambda_bunching,
        alpha: advancedSettings.alpha,
        facility_visit_window: advancedSettings.facility_visit_window,
        provider_constraints: providerConstraintsPayload,
      };

      console.log("=== OPTIMIZATION PAYLOAD ===");
      console.log("Current Constraints:", JSON.stringify(constraints, null, 2));
      console.log("Payload being sent:", JSON.stringify(payload, null, 2));
      console.log("===========================");

      const result: OptimizationResult = await runOptimization(
        payload,
        constraints
      );

      if (result.schedule && result.schedule.length > 0) {
        setOptimizedSchedule(result.schedule);
        setOptimizationMetrics(result.metrics);
        addSystemMessage(
          `Your schedule for has been successfully generated! Total patients scheduled: ${
            result.metrics.totalScheduled
          } out of ${
            result.metrics.totalDemand
          } (${result.metrics.coverageRate.toFixed(1)}% coverage).`
        );
      } else {
        setOptimizedSchedule(null);
        setOptimizationMetrics(null);
        addSystemMessage(
          `Schedule generation completed but no schedule was produced. The current constraints may be too restrictive.`
        );
      }
    } catch (error) {
      console.error("Error running optimization:", error);
      addSystemMessage(
        `An error occurred during optimization: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsOptimizing(false);
    }
  }, [
    user,
    constraints,
    selectedBusinessLine,
    selectedStartDate,
    planningDuration,
  ]);

  const handleDownloadSchedule = useCallback(
    (schedule: OptimizedDailySchedule[]) => {
      if (!user) {
        console.error("Download failed: No user logged in");
        return;
      }

      if (!schedule || schedule.length === 0) {
        console.error("Download failed: No schedule data");
        addSystemMessage("Cannot download - no schedule data available.");
        return;
      }

      try {
        console.log(
          "Generating ICS file for schedule:",
          schedule.length,
          "days"
        );
        const icsContent = generateIcsFile(schedule, user.name || "Provider");

        if (!icsContent) {
          console.error("ICS content is empty");
          addSystemMessage("Failed to generate calendar file.");
          return;
        }

        console.log(
          "ICS file generated, size:",
          icsContent.length,
          "characters"
        );
        const blob = new Blob([icsContent], {
          type: "text/calendar;charset=utf-8",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `schedule_${selectedStartDate}.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        console.log("Download triggered successfully");
        addSystemMessage(
          "Your schedule has been downloaded as an ICS calendar file!"
        );
      } catch (error) {
        console.error("Error downloading schedule:", error);
        addSystemMessage("An error occurred while downloading the schedule.");
      }
    },
    [user, selectedStartDate]
  );

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!user) return;

      const newUserMessage: ChatMessage = {
        id: Date.now().toString(),
        sender: "user",
        text,
      };
      setMessages((prev) => [...prev, newUserMessage]);
      setIsLoading(true);

      try {
        const result = await parseProviderRequest(
          text,
          conversationState,
          constraints
        );

        let nextSystemResponse = result.systemResponse || "";
        const parsedData = result.parsedData;
        let nextState = conversationState;

        // Handle SCHEDULING state
        if (conversationState === "SCHEDULING") {
          const changes = parsedData?.scheduleChanges;
          if (changes?.emailRecipient) {
            addSystemMessage(
              `Sending schedule to ${changes.emailRecipient}...`
            );

            // Call Python Backend
            fetch("http://127.0.0.1:5001/send_email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: changes.emailRecipient }),
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.status === "success") {
                  addSystemMessage("✅ Email sent successfully!");
                } else {
                  addSystemMessage(`❌ Email failed: ${data.message}`);
                }
              })
              .catch((err) => {
                console.error("Email fetch error:", err);
                addSystemMessage("❌ Error connecting to email server.");
              });
          }
          const hasConstraintChanges =
            changes &&
            (changes.ptoRequests?.length ||
              changes.weeklyAvailability?.length ||
              changes.dailyPatientLimit !== undefined ||
              changes.dayOfWeekConstraints?.length ||
              changes.dateConstraints?.length ||
              changes.ptoRemovals?.length ||
              changes.dateConstraintRemovals?.length ||
              changes.dayOfWeekConstraintRemovals?.length);

          const horizonChanged = typeof changes?.horizon !== "undefined";
          const startDateChanged =
            typeof changes?.selectedStartDate === "string";

          if (changes?.unclearRequest) {
            // 1. Highest priority: The LLM was confused.
            nextSystemResponse = changes.unclearRequest;
            nextState = "SCHEDULING";
          } else if (hasConstraintChanges) {
            // 2. Main priority: We have PTO, availability, etc.
            if (changes.horizon) setHorizon(changes.horizon); // Silently apply horizon change

            const newConstraints = applyChanges(constraints, changes);
            setProposedConstraints(newConstraints);
            const summary = generateChangeSummary(constraints, newConstraints);
            nextSystemResponse = `${summary} Is this correct? (yes/no)`;
            nextState = "AWAITING_SCHEDULE_CONFIRMATION";
          } else if (startDateChanged || horizonChanged) {
            // <-- 3. MODIFY THIS CONDITION
            // 3. Fallback: *Only* the start date or horizon changed.
            let responses: string[] = [];

            if (startDateChanged) {
              setSelectedStartDate(changes!.selectedStartDate!);
              responses.push(
                `start date updated to ${changes!.selectedStartDate!}`
              );
            }
            if (horizonChanged) {
              setHorizon(changes!.horizon!);
              responses.push(
                `planning horizon updated to ${changes!.horizon!}`
              );
            }

            nextSystemResponse = `Okay — ${responses.join(
              " and "
            )}. You can now generate a new schedule.`;
            nextState = "SCHEDULING";
          } else if (!changes?.emailRecipient) {
            // 4. Final fallback: Nothing was parsed.
            nextSystemResponse =
              "I received your message, but I couldn't identify any specific changes to your schedule constraints. Could you please clarify your request?";
          }
        } else if (conversationState === "AWAITING_SCHEDULE_CONFIRMATION") {
          if (parsedData?.confirmation && proposedConstraints) {
            setConstraints(proposedConstraints);
            setProposedConstraints(null);
            nextState = "SCHEDULING";
            nextSystemResponse =
              "OK, I've updated your constraints. You can now generate a new optimized schedule to see the impact of these changes.";
          } else {
            setProposedConstraints(null);
            nextState = "SCHEDULING";
            nextSystemResponse =
              "Got it. I've cancelled that change. How else can I help you?";
          }
        }

        setConversationState(nextState);
        addSystemMessage(nextSystemResponse);
      } catch (error) {
        console.error("Failed to process message:", error);
        addSystemMessage(
          "Sorry, I'm having trouble connecting. Please try again later."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [constraints, conversationState, user, proposedConstraints]
  );

  const isSchedulingMode =
    conversationState === "SCHEDULING" ||
    conversationState === "AWAITING_SCHEDULE_CONFIRMATION";

  // Show loading screen while checking authentication
  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-100">
        <p className="text-xl text-indigo-600">Loading application...</p>
      </div>
    );
  }

  // Show auth page if not authenticated
  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <Header
        user={user}
        onLogout={logout}
        onProfileClick={() => setShowProfileModal(true)}
      />

      <AdvancedSettingsSidebar
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={advancedSettings}
        onSettingsChange={setAdvancedSettings}
      />

      {showProfileModal && user && (
        <UserProfileModal
          user={user}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          style={{ height: "calc(100vh - 100px)" }}
        >
          <div className="lg:col-span-1 h-full">
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              isSchedulingMode={isSchedulingMode}
            />
          </div>

          <div className="lg:col-span-2 h-full overflow-y-auto space-y-6 bg-white rounded-lg p-6 shadow-sm relative">
            {isSchedulingMode && <Dashboard metrics={optimizationMetrics} />}
            <ConstraintsDisplay constraints={constraints} />
            <div className="border-t"></div>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">Parameter Controls</h2>

              {/* <<< --- 5. 打开侧边栏的按钮 (汉堡菜单样式) --- >>> */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                  />
                </svg>
                Tune Parameters
              </button>
            </div>

            <div className="border-t"></div>

            <OptimizationControl
              onGenerate={handleGenerateSchedule}
              isOptimizing={isOptimizing}
              isSchedulingMode={isSchedulingMode}
              businessLines={businessLines}
              selectedBusinessLine={selectedBusinessLine}
              onBusinessLineChange={setSelectedBusinessLine}
              selectedStartDate={selectedStartDate}
              onStartDateChange={handleStartDateChange}
              horizon={horizon}
              onHorizonChange={setHorizon}
              planningDuration={planningDuration}
              onPlanningDurationChange={setPlanningDuration}
            />

            <div className="border-t"></div>
            <ScheduleDisplay
              schedule={optimizedSchedule}
              isLoading={isOptimizing}
              onDownload={handleDownloadSchedule}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
