### system flow
- the system consist of sensor, camera, raspberrypi5 and esp32
- sensor is connected to esp32 located besides the road
- cameara is connected at the overpass bridge or trsffic light or somewhere above the sensor
- when sensor detects pm2.5 level reach the certain point it sends the reading to raspberry pi with timetstamp of reading using bluetooth connection
- then the raspi will compare the timestampt of the reading to the vihivles timestamp colleted
- then raspi will send the readings of sensor allongside vicles collected and timestamp of the readings to the firebase.
- the frontend will take those data from firebase and diaplay it in the dahbords with map of the location (currently no exact location so just choose any random area in laspinas philipines)