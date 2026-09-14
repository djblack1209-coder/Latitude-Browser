package backend

import "errors"

// Only the outer import/reset operation reopens managers. In particular a
// nested reset must not reopen admission in the middle of an import.
func (a *App) backupResumeProxyRuntimes() error {
	var errs []error
	if a.xrayMgr != nil {
		errs = append(errs, a.xrayMgr.ResumeAfterMaintenance(a.config))
	}
	if a.singboxMgr != nil {
		errs = append(errs, a.singboxMgr.ResumeAfterMaintenance(a.config))
	}
	if a.clashMgr != nil {
		errs = append(errs, a.clashMgr.ResumeAfterMaintenance(a.config))
	}
	return errors.Join(errs...)
}

func (a *App) backupFinishProxyMaintenance(result *map[string]interface{}, resultErr *error, hadScheduler bool) {
	if err := a.backupResumeProxyRuntimes(); err != nil {
		*resultErr = errors.Join(*resultErr, err)
		*result = nil
		return
	}
	if hadScheduler && a.speedScheduler == nil && a.browserMgr != nil && a.browserMgr.ProxyDAO != nil {
		a.startupInitSpeedScheduler()
	}
}
