using System;
using System.Globalization;
using System.IO;
using System.Text;
using GodTD.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using UnityEngine;

namespace GodTD.View
{
    /// <summary>
    /// 런 이벤트를 Application.persistentDataPath/GameLogs 아래에 즉시 저장한다.
    /// 저장 실패가 게임 진행을 막지 않도록 이후 기록만 비활성화한다.
    /// </summary>
    public sealed class UnityRunFileStore : IGameEventSink, IDisposable
    {
        static readonly JsonSerializerSettings CompactSettings = new JsonSerializerSettings
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            Culture = CultureInfo.InvariantCulture,
            Formatting = Formatting.None,
            NullValueHandling = NullValueHandling.Ignore,
        };

        static readonly JsonSerializerSettings SummarySettings = new JsonSerializerSettings
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            Culture = CultureInfo.InvariantCulture,
            Formatting = Formatting.Indented,
            NullValueHandling = NullValueHandling.Ignore,
        };

        StreamWriter eventWriter;

        public string RunDirectory { get; }
        public string EventsPath { get; }
        public string SummaryPath { get; }
        public string LastError { get; private set; }
        public bool Enabled => eventWriter != null && LastError == null;

        public UnityRunFileStore(string rootDirectory, string runId)
        {
            if (string.IsNullOrWhiteSpace(rootDirectory))
                throw new ArgumentException("Log root is required.", nameof(rootDirectory));
            if (string.IsNullOrWhiteSpace(runId))
                throw new ArgumentException("Run id is required.", nameof(runId));

            RunDirectory = Path.Combine(rootDirectory, runId);
            EventsPath = Path.Combine(RunDirectory, "events.jsonl");
            SummaryPath = Path.Combine(RunDirectory, "summary.json");
            Directory.CreateDirectory(RunDirectory);
            eventWriter = new StreamWriter(EventsPath, false, new UTF8Encoding(false));
        }

        public void Record(GameRunEvent gameEvent)
        {
            if (!Enabled) return;
            try
            {
                eventWriter.WriteLine(JsonConvert.SerializeObject(gameEvent, CompactSettings));
                eventWriter.Flush();
            }
            catch (Exception exception)
            {
                Disable(exception);
            }
        }

        public void Finish(RunSummary summary)
        {
            if (summary == null || LastError != null) return;
            try
            {
                eventWriter?.Flush();
                File.WriteAllText(
                    SummaryPath,
                    JsonConvert.SerializeObject(summary, SummarySettings) + Environment.NewLine,
                    new UTF8Encoding(false));
            }
            catch (Exception exception)
            {
                Disable(exception);
            }
        }

        void Disable(Exception exception)
        {
            LastError = exception.Message;
            Debug.LogWarning($"Game run log disabled: {exception.Message}");
            DisposeWriter();
        }

        void DisposeWriter()
        {
            if (eventWriter == null) return;
            try { eventWriter.Dispose(); }
            catch { }
            eventWriter = null;
        }

        public void Dispose() => DisposeWriter();
    }
}
