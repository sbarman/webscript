from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait # available since 2.4.0
from selenium.webdriver.support import expected_conditions as EC # available since 2.26.0

top_site = "http://www.amazon.com/s/ref=sr_tfs_0?fst=fs%3Acamera&rh=n%3A330405011%2Ck%3Acamera&keywords=camera&ie=UTF8&qid=1413246285"

#camera_site = "http://www.amazon.com/Nikon-COOLPIX-Digital-Camera-NIKKOR/dp/B00HQ4W3OE/ref=sr_1_1?s=photo&ie=UTF8&qid=1413246293&sr=1-1&keywords=camera"
camera_site = "http://www.amazon.com/Kodak-Easyshare-C195-Digital-Camera/dp/B003VTZE1W/ref=sr_1_2?s=photo&ie=UTF8&qid=1413247311&sr=1-2&keywords=camera"

# Create a new instance of the Firefox driver
driver = webdriver.Chrome()

def scrapePrice(site):
    driver.get(site)
    
    # the page is ajaxy so the title is originally this:
    print driver.title
    
    # find the element that's name attribute is q (the google search box)
    inputElement = driver.find_element_by_id("priceblock_ourprice")
    print inputElement.text

    colors =  driver.find_elements_by_xpath('//form[@id="twister"]//img')
    if colors:
      for color in colors:
        color.click()
        colorText = color.get_attribute('alt')
        print colorText
        title = driver.find_element_by_id("productTitle")
        WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.ID,
          "productTitle"),
          colorText))
        try:
          inputElement = driver.find_element_by_id("priceblock_ourprice")

          print inputElement.text
        except:
          print "no element"
    else:
      print "no colors"
    
    
    try:
        # WebDriverWait(driver, 10).until(EC.title_contains("cheese!"))
        pass
    finally:
        driver.quit()

scrapePrice(camera_site)
