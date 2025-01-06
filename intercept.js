(() => {
    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;
  
    XHR.open = function(method, url) {
      this.method = method;
      this.url = url;
      return open.apply(this, arguments);
    };
  
    XHR.send = function() {
      this.addEventListener('load', function() {
        try {
          if (this.url.includes('/api/onlineJudge/submitCode') && 
              this.method.toLowerCase() === 'post') {
            const response = JSON.parse(this.responseText);
            const submissionData = {
              success: response.success,
              totalTestCases: response.failedTestCase?.totalTestCases || 0,
              results: (response.results || []).map(result => ({
                time: parseFloat(result.time),
                memoryStorage: result.memoryStorage
              }))
            };
  
            if (submissionData.results.length > 0) {
              const avgTime = submissionData.results.reduce((sum, r) => sum + r.time, 0) / 
                            submissionData.results.length;
              const avgMemory = submissionData.results.reduce((sum, r) => sum + r.memoryStorage, 0) / 
                              submissionData.results.length;
              submissionData.averageTime = `${avgTime.toFixed(3)}ms`;
              submissionData.averageMemory = `${avgMemory.toFixed(2)}KB`;
            } else {
              submissionData.averageTime = '0ms';
              submissionData.averageMemory = '0KB';
            }
  
            // Send data back to content script
            window.postMessage({
              type: 'SUBMISSION_RESPONSE',
              payload: submissionData
            }, '*');
          }
        } catch (error) {
          console.error('Error in interceptor:', error);
        }
      });
      return send.apply(this, arguments);
    };
  })();