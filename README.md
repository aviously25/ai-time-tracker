# AI Time Tracker

A powerful, AI-powered time tracking application that automatically monitors your computer usage and provides intelligent insights to improve productivity.

## Features

### 🎯 **Automatic Activity Tracking**
- Monitors active windows and applications in real-time
- Tracks website usage and browsing patterns
- Categorizes activities automatically (productivity, development, social media, etc.)
- Runs silently in the background with system tray integration

### 📊 **Beautiful Analytics Dashboard**
- Real-time statistics and productivity metrics
- Interactive charts showing time distribution by category
- Top applications and websites tracking
- Daily, weekly, and monthly activity views

### 🤖 **AI-Powered Insights**
- TogetherAI integration for intelligent productivity analysis
- Personalized recommendations and tips
- Activity categorization and scoring
- Productivity trend analysis

### 🔧 **Customizable Settings**
- Adjustable tracking intervals
- Auto-start on system boot
- Privacy-focused local data storage
- Export and backup capabilities

## Screenshots

The application features a modern, clean interface with:
- Gradient sidebar navigation
- Real-time activity monitoring
- Interactive charts and statistics
- AI-powered insights panel
- Comprehensive settings management

## Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- macOS, Windows, or Linux

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-time-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **For development**
   ```bash
   npm run dev
   ```

### Building for Distribution

```bash
# Build for current platform
npm run build

# Build for all platforms
npm run dist
```

## Configuration

### TogetherAI API Setup (Optional)

For AI-powered insights, you'll need a TogetherAI API key:

1. Get an API key from [TogetherAI](https://together.ai/)
2. Open the application settings
3. Enter your API key in the "TogetherAI API Key" field
4. Enable "AI insights" in settings

### Privacy & Data Storage

- All data is stored locally in SQLite database
- No data is sent to external servers (except TogetherAI API calls)
- Database location: `~/.ai-time-tracker.db`

## Usage

### Getting Started

1. **Launch the application**
   - The app will appear in your system tray
   - Click the tray icon to open the main window

2. **Start tracking**
   - Click "Start Tracking" in the sidebar
   - The app will begin monitoring your activity automatically

3. **View your data**
   - Dashboard: Overview of your productivity metrics
   - Activities: Detailed list of all tracked activities
   - AI Insights: Intelligent analysis and recommendations
   - Settings: Configure tracking preferences

### Understanding Your Data

#### Activity Categories
- **Productivity**: Work-related applications, email, documents
- **Development**: Coding tools, IDEs, technical work
- **Communication**: Chat apps, video calls, messaging
- **Social Media**: Social networking sites
- **Entertainment**: Games, videos, music
- **News**: Reading news and current events
- **Shopping**: Online shopping and e-commerce
- **System**: File management and system tools

#### Productivity Score
The app calculates a productivity score (1-10) based on:
- Time spent in productive categories
- Balance between work and leisure activities
- Consistency in productive time usage

## Development

### Project Structure
```
src/
├── main.js                 # Main Electron process
├── tracker/
│   └── activity-tracker.js # Activity monitoring logic
├── database/
│   └── database-manager.js # SQLite database operations
├── ai/
│   └── ai-analyzer.js      # OpenAI integration
└── renderer/
    ├── index.html          # Main UI
    ├── styles.css          # Styling
    └── renderer.js         # UI logic
```

### Key Technologies
- **Electron**: Cross-platform desktop application framework
- **SQLite**: Local data storage
- **Chart.js**: Interactive data visualization
- **TogetherAI API**: AI-powered insights using Llama models
- **active-win**: Window and application tracking

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Privacy & Security

### Data Collection
- Only tracks active window titles and application names
- No keystrokes, passwords, or personal content is recorded
- All data is stored locally on your device

### Permissions Required
- **macOS**: Accessibility permissions for window tracking
- **Windows**: No additional permissions required
- **Linux**: May require additional setup for window tracking

## Troubleshooting

### Common Issues

**App not tracking activities**
- Check if tracking is enabled in the sidebar
- Ensure the app has necessary permissions
- Restart the application

**Charts not displaying**
- Wait for some activity data to be collected
- Check browser console for JavaScript errors
- Refresh the dashboard

**AI insights not working**
- Verify TogetherAI API key is correctly entered
- Check internet connection
- Ensure AI insights are enabled in settings

### Platform-Specific Notes

**macOS**
- Grant accessibility permissions in System Preferences > Security & Privacy
- The app may need to be added to the accessibility list

**Windows**
- No additional setup required
- App runs with standard user permissions

**Linux**
- May require `xdotool` or similar for window tracking
- Check distribution-specific requirements

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review existing GitHub issues
3. Create a new issue with detailed information

## Roadmap

- [ ] Export data to CSV/JSON
- [ ] Custom activity categories
- [ ] Productivity goals and alerts
- [ ] Team collaboration features
- [ ] Mobile companion app
- [ ] Advanced AI analytics
- [ ] Integration with calendar apps
- [ ] Pomodoro timer integration

---

**Note**: This application is designed for personal productivity tracking. Please respect privacy and use responsibly. 