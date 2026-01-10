--[[
Game : https://www.roblox.com/games/10456811278
Codded by : Keathunsar : https://github.com/dady172172/Roblox-Cheats : https://discord.gg/MhMB3c2CBn
GUI Made by : xTheAlex14 : https://teppyboy.github.io/Mirrors/Documentations/Zypher_UI/zypher.wtf/docs/uilibdocs.html
]]--

---- vars ----
local kVars = {}
kVars.WindowName = "Milk Tycoon GUI"
kVars.lp = game:GetService('Players').LocalPlayer
kVars.vu = game:GetService('VirtualUser')
kVars.uis = game:GetService('UserInputService')
kVars.rs = game:GetService('ReplicatedStorage')

-- Wait for character & parts
repeat wait() until kVars.lp.Character and kVars.lp.Character:FindFirstChild('Humanoid') and kVars.lp.Character:FindFirstChild('HumanoidRootPart')
kVars.humanoid = kVars.lp.Character:WaitForChild('Humanoid')
kVars.hrp = kVars.lp.Character:WaitForChild('HumanoidRootPart')

---- destroy old gui if exists ----
if game:GetService("CoreGui"):FindFirstChild(kVars.WindowName) then
    game:GetService("CoreGui"):FindFirstChild(kVars.WindowName):Destroy()
    wait(2)
end

---- antiAFK ----
kVars.connectAntiAfk = kVars.lp.Idled:Connect(function()
    kVars.vu:CaptureController()
    kVars.vu:ClickButton2(Vector2.new())
end)

---- gui build ----
local library = loadstring(game:HttpGet("https://raw.githubusercontent.com/teppyboy/RbxScripts/master/Misc/UI_Libraries/Zypher/Library.lua"))()
local Window = library:CreateMain({
    projName = kVars.WindowName,
    Resizable = true,
    MinSize = UDim2.new(0,400,0,400),
    MaxSize = UDim2.new(0,750,0,500),
})

-- Création des catégories / sections existantes
local pageMain = Window:CreateCategory("Main")
local sectionFarm = pageMain:CreateSection("Farm")
local sectionBuy = pageMain:CreateSection("Buttons")

local pageTeleport = Window:CreateCategory("Teleport")
local sectionTPToPlayer = pageTeleport:CreateSection("Teleport To Player")

local pageCharacter = Window:CreateCategory("Character")
local sectionCharacter = pageCharacter:CreateSection("Options")

local pageMisc = Window:CreateCategory("Misc")
local sectionKeybinds = pageMisc:CreateSection("KeyBinds")
local sectionWorld = pageMisc:CreateSection("World Options")
local sectionMisc = pageMisc:CreateSection("Options")

local pageCredits = Window:CreateCategory("Credits")
local sectionCreditsKeath = pageCredits:CreateSection("Coded by : Keathunsar")
local sectionCreditsAlex = pageCredits:CreateSection("UI-Lib by : xTheAlex14")

-- ==================== ESP Implementation ====================
local ESPState = {
    ESP = false,
    Box = true,
    Name = true,
    Weapon = true,
    Distance = true,
}

local ESPObjects = {}

local function getTool(char)
	for _, v in ipairs(char:GetChildren()) do
		if v:IsA("Tool") then
			return v.Name
		end
	end
	return "None"
end

local function createESPForPlayer(player)
	if player == kVars.lp then return end

	local function onChar(char)
		if ESPObjects[player] then
			-- Nettoyage si déjà existant
			for _, v in pairs(ESPObjects[player]) do
				if typeof(v) == "Instance" then
					v:Destroy()
				end
			end
		end

		local head = char:WaitForChild("Head")
		local hrp = char:WaitForChild("HumanoidRootPart")

		local highlight = Instance.new("Highlight")
		highlight.FillColor = Color3.fromRGB(0, 200, 255)
		highlight.OutlineColor = Color3.fromRGB(0, 200, 255)
		highlight.FillTransparency = 0.85
		highlight.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
		highlight.Parent = char

		local billboard = Instance.new("BillboardGui")
		billboard.Adornee = head
		billboard.Size = UDim2.new(4, 0, 5.5, 0)
		billboard.StudsOffset = Vector3.new(0, 2.8, 0)
		billboard.AlwaysOnTop = true
		billboard.Parent = head

		local box = Instance.new("Frame", billboard)
		box.Size = UDim2.new(1, 0, 1, 0)
		box.BackgroundTransparency = 1
		box.BorderSizePixel = 2
		box.BorderColor3 = Color3.fromRGB(0, 200, 255)

		local name = Instance.new("TextLabel", billboard)
		name.Size = UDim2.new(1, 0, 0.15, 0)
		name.Position = UDim2.new(0, 0, -0.17, 0)
		name.BackgroundTransparency = 1
		name.Font = Enum.Font.GothamBold
		name.TextScaled = true
		name.TextColor3 = Color3.new(1,1,1)

		local info = Instance.new("TextLabel", billboard)
		info.Size = UDim2.new(1, 0, 0.18, 0)
		info.Position = UDim2.new(0, 0, 1, 0)
		info.BackgroundTransparency = 1
		info.Font = Enum.Font.Gotham
		info.TextScaled = true
		info.TextColor3 = Color3.new(1,1,1)

		ESPObjects[player] = {
			Highlight = highlight,
			Billboard = billboard,
			Box = box,
			Name = name,
			Info = info,
			Char = char
		}
	end

	if player.Character then
		onChar(player.Character)
	end
	player.CharacterAdded:Connect(onChar)
end

local function removeESPForPlayer(player)
	if ESPObjects[player] then
		for _, v in pairs(ESPObjects[player]) do
			if typeof(v) == "Instance" then
				v:Destroy()
			end
		end
		ESPObjects[player] = nil
	end
end

game:GetService("RunService").RenderStepped:Connect(function()
	for player, esp in pairs(ESPObjects) do
		local char = esp.Char
		local lchar = kVars.lp.Character

		if not char or not lchar then continue end
		if not char:FindFirstChild("HumanoidRootPart") then continue end
		if not lchar:FindFirstChild("HumanoidRootPart") then continue end

		local dist = (lchar.HumanoidRootPart.Position - char.HumanoidRootPart.Position).Magnitude
		local visible = ESPState.ESP and dist <= 2000

		esp.Highlight.Enabled = visible
		esp.Billboard.Enabled = visible

		if not visible then continue end

		esp.Box.Visible = ESPState.Box
		esp.Name.Visible = ESPState.Name
		esp.Info.Visible = ESPState.Weapon or ESPState.Distance

		esp.Name.Text = player.Name

		local text = ""
		if ESPState.Distance then
			text = "[" .. math.floor(dist) .. "m]"
		end
		if ESPState.Weapon then
			text ..= " | " .. getTool(char)
		end
		esp.Info.Text = text
	end
end)

game.Players.PlayerAdded:Connect(function(p)
	createESPForPlayer(p)
end)
game.Players.PlayerRemoving:Connect(function(p)
	removeESPForPlayer(p)
end)

for _, p in pairs(game.Players:GetPlayers()) do
	createESPForPlayer(p)
end

-- ==== ESP UI ====

local ESPPage = Window:CreateCategory("ESP")
local ESPSection = ESPPage:CreateSection("ESP Options")

ESPSection:Create("Toggle", "Enable ESP", function(bool)
	ESPState.ESP = bool
	if not bool then
		for player, _ in pairs(ESPObjects) do
			removeESPForPlayer(player)
		end
		ESPObjects = {}
	else
		for _, p in pairs(game.Players:GetPlayers()) do
			createESPForPlayer(p)
		end
	end
end, {default = ESPState.ESP})

ESPSection:Create("Toggle", "Show Box", function(bool)
	ESPState.Box = bool
end, {default = ESPState.Box})

ESPSection:Create("Toggle", "Show Names", function(bool)
	ESPState.Name = bool
end, {default = ESPState.Name})

ESPSection:Create("Toggle", "Show Weapons", function(bool)
	ESPState.Weapon = bool
end, {default = ESPState.Weapon})

ESPSection:Create("Toggle", "Show Distance", function(bool)
	ESPState.Distance = bool
end, {default = ESPState.Distance})

-- =================== Here you can add back your other existing code (farm, teleport, misc, etc.) ===================

-- Example: re-adding your Farm toggle to test
sectionFarm:Create("Toggle", "Milk", function(bool)
    kVars.boolMilk = bool
    if bool then
        spawn(function()
            while kVars.boolMilk do
                wait()
                local plrTycoon = nil
                for i,v in pairs(game:GetService("Workspace").Tycoons:GetChildren()) do
                    if v.Owner.Value == kVars.lp.Name then
                        plrTycoon = v
                        break
                    end
                end 
                for i,v in pairs(plrTycoon.Drops:GetChildren()) do
                    wait()
                    if v:FindFirstChild("Part") then
                        v.Part.CFrame = kVars.lp.Character.HumanoidRootPart.CFrame                   
                    end
                end
            end
        end)
    end
end,{default = false})

-- etc... ajoute le reste de ton code ici

-- =================== Fin ===================

-- Ajuste la taille de la fenêtre (optionnel)
game:GetService("CoreGui"):FindFirstChild(kVars.WindowName).Motherframe.Size = UDim2.new(0, 495, 0, 400)

-- Nettoyage si le GUI est supprimé
kVars.cR = game:GetService("CoreGui").ChildRemoved:Connect(function(child)
    if child.Name == kVars.WindowName then
        for i,v in pairs(kVars) do
            if type(v) == "boolean" then
                kVars[i] = false
            end
        end
        if kVars.connectAntiAfk then kVars.connectAntiAfk:Disconnect() end
        if kVars.connectInputBegan then kVars.connectInputBegan:Disconnect() end
        if kVars.connectJumpRequest then kVars.connectJumpRequest:Disconnect() end
        if kVars.plrAdded then kVars.plrAdded:Disconnect() end
        if kVars.plrRemovingConnect then kVars.plrRemovingConnect:Disconnect() end
        wait(1)
        script:Destroy()
        kVars.cR:Disconnect()
    end
end)
