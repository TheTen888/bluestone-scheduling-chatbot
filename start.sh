#!/bin/bash

echo "🚀 Starting Bluestone Scheduling System..."

# Function to check if process is running
is_running() {
    pgrep -f "$1" > /dev/null
}

# Check and start backend
if is_running "python app.py"; then
    echo "✅ Flask backend already running"
else
    echo "🔄 Starting Flask backend..."
    python app.py &
    BACKEND_PID=$!
fi

# Check and start frontend
if is_running "react-scripts start"; then
    echo "✅ React frontend already running"
else
    echo "🔄 Starting React frontend..."
    cd frontend && npm start &
    FRONTEND_PID=$!
    cd ..
fi

# Wait for all services to be ready
echo "⏳ Waiting for services to start..."
sleep 5

echo ""
echo "🎉 Bluestone Scheduling System is ready!"
echo "🖥️  Access the application at: http://localhost:3000"
echo "🔧 Backend API available at: http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop all services"

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    [ ! -z "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null
    [ ! -z "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

# Set up signal handling
trap cleanup INT TERM

# Keep script running
while true; do
    sleep 1
done