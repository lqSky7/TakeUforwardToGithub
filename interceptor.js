(() => {
  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;

  XHR.open = function (method, url) {
    this.method = method;
    this.url = url;
    return open.apply(this, arguments);
  };

  XHR.send = function (body) {
    console.log("XHR send called for URL:", this.url, "Method:", this.method);
    if (
      this.url.includes("backend-go.takeuforward.org/api/v1/plus/judge/submit") &&
      this.method.toLowerCase() === "post"
    ) {
      console.log("Intercepting submit request...");
      console.log("Submit body:", body);
      try {
        const payload = JSON.parse(body);
        console.log("Submit payload:", payload);
        window.postMessage(
          {
            type: "CODE_SUBMIT",
            payload: {
              language: payload.language,
              usercode: payload.usercode,
              problem_id: payload.problem_id,
            },
          },
          "*",
        );
      } catch (error) {
        console.error("Error parsing submit payload:", error);
      }
    }
    this.addEventListener("load", function () {
      console.log("XHR load for URL:", this.url);
      try {
        if (
          this.url.includes("backend-go.takeuforward.org/api/v1/plus/judge/check-submit") &&
          this.method.toLowerCase() === "get"
        ) {
          console.log("Intercepting submission check response...");
          const response = JSON.parse(this.responseText);
          console.log("Submission check response:", response);
          if (response.success && response.data) {
            const data = response.data;
            const submissionData = {
              success: data.status === "Accepted",
              totalTestCases: data.total_test_cases,
              passedTestCases: data.passed_test_cases,
              averageTime: data.time + "s",
              averageMemory: data.memory,
            };
            console.log("Processed submission data:", submissionData);

            // Send data back to content script
            window.postMessage(
              {
                type: "SUBMISSION_RESPONSE",
                payload: submissionData,
              },
              "*",
            );
          } else {
            console.log("Submission check not successful or no data");
          }
        }
      } catch (error) {
        console.error("Error in interceptor:", error);
      }
    });
    return send.apply(this, arguments);
  };
})();
