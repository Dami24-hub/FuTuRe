# Mobile Application Testing Suite

This directory contains the mobile testing suite for the FuTuRe application, focusing on testing the web application on mobile devices and emulators.

## Overview

The mobile testing suite includes:
- **Device Testing**: Automated tests using Appium and WebDriverIO
- **Performance Testing**: Lighthouse audits for mobile performance
- **Accessibility Testing**: Axe-core scans for mobile accessibility compliance
- **Test Automation**: Scripts to run comprehensive test suites
- **Reporting**: Allure reports for test results
- **Monitoring**: Test result logging and alerting

## Prerequisites

- Node.js 18+
- Java 8+ (for Appium)
- Android SDK (for Android testing)
- Xcode (for iOS testing, macOS only)

## Installation

1. Install dependencies:
   ```bash
   cd mobile-tests
   npm install
   ```

2. Install Appium globally:
   ```bash
   npm install -g appium
   appium driver install uiautomator2
   ```

3. For Android testing, set up Android emulator or connect a device.

## Configuration

### WebDriverIO Configuration (`wdio.conf.js`)
- Configured for Android Chrome testing
- Can be extended for iOS Safari testing
- Reports to Allure

### Test Capabilities
- Platform: Android 11.0
- Browser: Chrome
- Device: Emulator

## Running Tests

### Full Test Suite
```bash
cd mobile-tests
node run-tests.js
```

### Individual Test Types

#### Device Tests
```bash
npm test
```

#### Performance Tests
```bash
npm run performance
```

#### Accessibility Tests
```bash
npm run accessibility
```

#### Generate Reports
```bash
npm run report
```

## Test Structure

```
mobile-tests/
├── test/
│   └── specs/
│       └── mobile.spec.js    # Main mobile test specs
├── performance-test.js       # Lighthouse performance testing
├── accessibility-test.js     # Axe-core accessibility testing
├── monitor.js               # Test monitoring and logging
├── run-tests.js            # Test automation script
├── wdio.conf.js            # WebDriverIO configuration
└── package.json
```

## Monitoring

The monitoring system logs test results and generates daily summaries. Run monitoring manually:

```bash
node monitor.js
```

## Reports

Test reports are generated in:
- `allure-results/`: Allure test reports
- `reports/`: Performance and accessibility reports
- `logs/`: Test execution logs

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run Mobile Tests
  run: |
    cd mobile-tests
    npm install
    node run-tests.js
```

## Best Practices

1. **Device Coverage**: Test on multiple device sizes and orientations
2. **Network Conditions**: Test under various network speeds
3. **Touch Interactions**: Verify swipe, tap, and gesture handling
4. **Performance Budgets**: Set performance score thresholds
5. **Accessibility Standards**: Maintain WCAG compliance

## Troubleshooting

### Common Issues

1. **Appium Server Not Starting**: Ensure Java and Android SDK are installed
2. **Emulator Not Found**: Create an Android emulator or connect a device
3. **Chrome Driver Issues**: Update Chrome and chromedriver versions
4. **Port Conflicts**: Check if port 4723 is available

### Debug Mode

Run tests with verbose logging:
```bash
DEBUG=1 npm test
```

## Contributing

When adding new mobile tests:
1. Follow the existing test structure
2. Add appropriate waits and assertions
3. Include error handling
4. Update this documentation</content>
<parameter name="filePath">/workspaces/FuTuRe/mobile-tests/README.md