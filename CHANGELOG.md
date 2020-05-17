# Change Log
All notable changes to this project will be documented in this file.
## 0.7.35 (17.05.2020) 
- added read console configuration after HB restart and store in to /homebridge_folder/xboxTv/ file.

## 0.7.2 (14.05.2020) 
- added descriptions in config.schema.json

## 0.7.0 (14.05.2020)
- revert back with defaults inputs
- added input type to inputs
- added other fixes in code to prevent app crash without configured inputs

## 0.6.0 (14.05.2020) 
- added Types to the inputs references (please update Yours config.json)
- do not add or remove if exist from the config.json default inputs which are now contain in the  code
### Default inputs:
    {   
        "name": "TV",
        "reference": "Microsoft.Xbox.LiveTV_8wekyb3d8bbwe!Microsoft.Xbox.LiveTV.Application",
        "type": "HDMI"
	},
	{
	    "name": "Dashboard",
	    "reference": "Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application",
	    "type": "HOME_SCREEN"
	},
	{
	    "name": "Settings",
	    "reference": "Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application",
	    "type": "OTHER"
	},
	{
	    "name": "Akccessory",
	    "reference": "Microsoft.XboxDevices_8wekyb3d8bbwe!App",
	    "type": "OTHER"
	}

## 0.5.0 (10.05.2020) 
- code cleanup
- some fixes and performance inprovements

## 0.4.0 (06.05.2020) 
- adapted to HAP-Node JS lib

## 0.3.12 (05.05.2020)
- cleanup code
- please updaje Your config.json (replace 'apps' with 'inputs')

## 0.3.12 (05.05.2020)
- fixes and performance inprovements
- correted logging state

## 0.3.9 (05.05.2020)
- added real time read and write data for (lightbulb slider volume cont

## 0.2.3 (27.04.2020)
- added switch ON/OFF volume control (please update config.json)

## 0.2.1 (27.04.2020)
- added Siri volume control
- added Slider (Brightness) volume control

## 0.1.39 (21.04.2020)
- different fixes.

## 0.1.12 (13.04.2020)
- fixed memory leak.

## 0.1.9 (07.04.2020)
- fixed store of positin in HomeKit fav.

## 0.1.6 (06.04.2020)
- test 1

## 0.1.5 (05.04.2020)
- test

## 0.1.2 (05.04.2020)
- some improvements

## 0.1.1 (05.04.2020)
- update README.md
- update sample-config.json

## 0.1.0 (29.03.2020)
- fixes crash if no device name defined
- fixed config.schema.json
- fixed store file inside the Homebridge directory

## 0.0.118 (29.03.2020)
- some small fixes

## 0.0.115 (21.03.2020)
- corrections for homebridge git
- performance improvement

## 0.0.1 (5.02.2020)
- initial release)
- initial release
