package browser

import (
	"encoding/json"
	"encoding/xml"
	"os"
	"path/filepath"
	"strings"
)

// GetChromeVersion 从 manifest.json 读取 Chrome 版本号
func (m *Manager) GetChromeVersion(corePath string) string {
	corePath = strings.TrimSpace(corePath)
	if corePath == "" {
		return ""
	}

	baseDir := m.ResolveRelativePath(corePath)

	// 尝试读取 manifest.json 或 *.manifest 文件
	manifestPath := filepath.Join(baseDir, "manifest.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		// 尝试查找 *.manifest 文件
		matches, _ := filepath.Glob(filepath.Join(baseDir, "*.manifest"))
		if len(matches) > 0 {
			// 从文件名提取版本号，如 "142.0.7444.175.manifest"
			baseName := filepath.Base(matches[0])
			version := strings.TrimSuffix(baseName, ".manifest")
			if version != "" {
				return version
			}
		}
		return macBundleVersion(baseDir)
	}

	// 解析 JSON
	var manifest struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return ""
	}

	return manifest.Version
}

// Official macOS Chromium distributions store their version in the app plist.
func macBundleVersion(baseDir string) string {
	for _, candidate := range CoreExecutableCandidates() {
		bundle, _, ok := strings.Cut(candidate, ".app/")
		if !ok {
			continue
		}
		file, err := os.Open(filepath.Join(baseDir, bundle+".app", "Contents", "Info.plist"))
		if err != nil {
			continue
		}
		decoder := xml.NewDecoder(file)
		for {
			token, err := decoder.Token()
			if err != nil {
				break
			}
			start, ok := token.(xml.StartElement)
			if !ok || start.Name.Local != "key" {
				continue
			}
			var key string
			if decoder.DecodeElement(&key, &start) != nil || key != "CFBundleShortVersionString" {
				continue
			}
			for {
				next, err := decoder.Token()
				if err != nil {
					break
				}
				if element, ok := next.(xml.StartElement); ok {
					var version string
					if element.Name.Local == "string" && decoder.DecodeElement(&version, &element) == nil {
						file.Close()
						return strings.TrimSpace(version)
					}
					break
				}
			}
		}
		file.Close()
	}
	return ""
}

// CountInstancesByCore 统计使用指定内核的实例数量
func (m *Manager) CountInstancesByCore(coreId string) int {
	coreId = strings.TrimSpace(coreId)
	count := 0
	countByCoreID := func(profileCoreId string) {
		// 如果实例的 CoreId 为空，则使用默认内核
		if profileCoreId == "" {
			defaultCore, found := m.GetDefaultCore()
			if found && strings.EqualFold(defaultCore.CoreId, coreId) {
				count++
			}
		} else if strings.EqualFold(profileCoreId, coreId) {
			count++
		}
	}

	if len(m.Profiles) > 0 {
		for _, profile := range m.Profiles {
			countByCoreID(normalizeProfileCoreID(profile.CoreId))
		}
		return count
	}

	for _, profile := range m.Config.Browser.Profiles {
		countByCoreID(normalizeProfileCoreID(profile.CoreId))
	}
	return count
}

// GetCoresExtendedInfo 获取所有内核的扩展信息
func (m *Manager) GetCoresExtendedInfo() []CoreExtendedInfo {
	cores := m.ListCores()
	result := make([]CoreExtendedInfo, 0, len(cores))
	for _, core := range cores {
		info := CoreExtendedInfo{
			CoreId:        core.CoreId,
			ChromeVersion: m.GetChromeVersion(core.CorePath),
			InstanceCount: m.CountInstancesByCore(core.CoreId),
		}
		result = append(result, info)
	}
	return result
}
